package com.privateremote.appletv.appletv

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Envelope encryption for pairing credentials, backed directly by the Android
 * Keystore (no EncryptedSharedPreferences/MasterKey — those are deprecated).
 *
 * The AES key never leaves the Keystore; on devices with a secure element or
 * TEE it is not extractable at all. Every stored blob is self-describing: a
 * one-byte format version, then the GCM nonce, then ciphertext, so future
 * format changes are detectable instead of silently misparsed.
 */
object AppleTvSecureStore {

    private const val KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "appletv_credentials_key"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val GCM_TAG_BITS = 128
    private const val IV_LENGTH = 12
    private const val FORMAT_VERSION: Byte = 1

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                // The service reconnects in the background; it must never
                // block on a device-unlock prompt.
                .setUserAuthenticationRequired(false)
                .build(),
        )
        return generator.generateKey()
    }

    /** Encrypt to a self-contained base64 blob: version || iv || ciphertext+tag. */
    fun encrypt(plaintext: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val iv = cipher.iv
        val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))

        val payload = ByteArray(1 + iv.size + ciphertext.size)
        payload[0] = FORMAT_VERSION
        System.arraycopy(iv, 0, payload, 1, iv.size)
        System.arraycopy(ciphertext, 0, payload, 1 + iv.size, ciphertext.size)
        return Base64.encodeToString(payload, Base64.NO_WRAP)
    }

    /** Decrypt a blob produced by [encrypt], or null if malformed/undecryptable. */
    fun decrypt(blob: String): String? = runCatching {
        val raw = Base64.decode(blob, Base64.NO_WRAP)
        require(raw.size > 1 + IV_LENGTH) { "ciphertext too short" }
        require(raw[0] == FORMAT_VERSION) { "unsupported blob format ${raw[0]}" }

        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            secretKey(),
            GCMParameterSpec(GCM_TAG_BITS, raw, 1, IV_LENGTH),
        )
        val offset = 1 + IV_LENGTH
        String(cipher.doFinal(raw, offset, raw.size - offset), Charsets.UTF_8)
    }.getOrNull()
}
