import { Check, ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../animations/constants';
import { PressableScale } from '../components/PressableScale';

/** Plain list rows, the way system settings screens are built: text, a trailing value, hairline dividers. */

export function Section({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.group}>{children}</View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

interface RowProps {
  title: string;
  detail?: string;
  /** Trailing content: a value, a link-style action, a switch, a check. */
  right?: ReactNode;
  first?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'radio';
  selected?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}

export function Row({ title, detail, right, first, onPress, accessibilityLabel, accessibilityRole, selected, disabled, destructive }: RowProps) {
  const body = (
    <>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, destructive && styles.destructive]}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {right}
    </>
  );
  const rowStyle = [styles.row, !first && styles.rowDivider, disabled && styles.disabled];
  if (!onPress) return <View style={rowStyle}>{body}</View>;
  return (
    <PressableScale
      haptic="selection"
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole={accessibilityRole}
      selected={selected}
      onPress={onPress}
      style={rowStyle}
    >
      {body}
    </PressableScale>
  );
}

export const Value = ({ children, tone }: { children: string; tone?: 'good' | 'muted' }) => (
  <Text style={[styles.value, tone === 'good' && styles.valueGood]}>{children}</Text>
);

/** Text-only action, in the accent color so it reads as tappable without a button chrome. */
export const Action = ({ children }: { children: string }) => <Text style={styles.action}>{children}</Text>;

export const Chevron = () => <ChevronRight size={18} color={COLORS.iconSecondary} strokeWidth={2.2} />;
export const Checkmark = () => <Check size={20} color={COLORS.accent} strokeWidth={2.6} />;

const styles = StyleSheet.create({
  section: { marginTop: 28 },
  sectionTitle: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '500', marginLeft: 16, marginBottom: 7 },
  footer: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginHorizontal: 16, marginTop: 8 },
  group: { borderRadius: 12, backgroundColor: COLORS.cardFill, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 11, paddingHorizontal: 16 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.separator },
  rowText: { flex: 1 },
  rowTitle: { color: COLORS.icon, fontSize: 16 },
  rowDetail: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  disabled: { opacity: 0.4 },
  destructive: { color: COLORS.danger },
  value: { color: COLORS.textSecondary, fontSize: 16 },
  valueGood: { color: COLORS.success },
  action: { color: COLORS.accent, fontSize: 16, fontWeight: '600' },
});
