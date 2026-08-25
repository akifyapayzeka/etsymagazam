/**
 * Tiny React-element-shaped node builder so templates can describe layouts
 * without pulling in React/JSX tooling — satori only needs objects that
 * look like `{ type, props: { style, children } }`.
 */
export interface SatoriNode {
  type: string;
  props: {
    style?: Record<string, string | number>;
    children?: SatoriNode | SatoriNode[] | string | (SatoriNode | string)[];
    [key: string]: unknown;
  };
}

export function h(
  type: string,
  props: Record<string, unknown> = {},
  ...children: (SatoriNode | string | null | undefined | false)[]
): SatoriNode {
  const flatChildren = children.filter((c): c is SatoriNode | string => Boolean(c));
  return {
    type,
    props: {
      ...props,
      children: flatChildren.length === 1 ? flatChildren[0] : flatChildren,
    },
  } as SatoriNode;
}
