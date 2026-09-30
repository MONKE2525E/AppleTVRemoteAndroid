/** Mirrors android/app/.../fold/FoldStateModule.kt's FoldSnapshot. */

export type FoldPosture = 'flat' | 'half_opened';
export type FoldOrientation = 'none' | 'horizontal' | 'vertical';
export type FoldOcclusionType = 'none' | 'full';

export interface FoldBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface FoldState {
  posture: FoldPosture;
  bounds: FoldBounds | null;
  orientation: FoldOrientation;
  isSeparating: boolean;
  occlusionType: FoldOcclusionType;
}

export const FLAT_FOLD_STATE: FoldState = {
  posture: 'flat',
  bounds: null,
  orientation: 'none',
  isSeparating: false,
  occlusionType: 'none',
};
