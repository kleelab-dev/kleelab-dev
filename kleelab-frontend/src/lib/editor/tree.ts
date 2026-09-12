import { CONTAINER_TYPES, type Node, type NodeType } from '@/lib/document';

/**
 * Pure, immutable tree operations for the document model.
 *
 * Every function returns a new value and never mutates its input, so the editor
 * store can treat each edit as a snapshot for undo/redo.
 */

export function canHaveChildren(type: NodeType): boolean {
  return CONTAINER_TYPES.includes(type);
}

export function findNode(root: Node, id: string): Node | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const match = findNode(child, id);
    if (match) return match;
  }
  return null;
}

export function findParent(root: Node, id: string): Node | null {
  for (const child of root.children ?? []) {
    if (child.id === id) return root;
    const match = findParent(child, id);
    if (match) return match;
  }
  return null;
}

/** True when `id` is `node` itself or anywhere beneath it. */
export function isSelfOrDescendant(node: Node, id: string): boolean {
  if (node.id === id) return true;
  return (node.children ?? []).some((child) => isSelfOrDescendant(child, id));
}

/** Return a new tree with `updater` applied to the node matching `id`. */
export function updateNode(root: Node, id: string, updater: (node: Node) => Node): Node {
  if (root.id === id) return updater(root);
  if (!root.children?.length) return root;
  return {
    ...root,
    children: root.children.map((child) => updateNode(child, id, updater)),
  };
}

export function removeNode(root: Node, id: string): { root: Node; removed: Node | null } {
  let removed: Node | null = null;

  const walk = (node: Node): Node => {
    if (!node.children?.length) return node;
    const children: Node[] = [];
    for (const child of node.children) {
      if (child.id === id) {
        removed = child;
        continue;
      }
      children.push(walk(child));
    }
    return { ...node, children };
  };

  const nextRoot = root.id === id ? root : walk(root);
  return { root: nextRoot, removed };
}

export function insertNode(
  root: Node,
  parentId: string,
  index: number,
  node: Node,
): Node {
  return updateNode(root, parentId, (parent) => {
    const children = [...(parent.children ?? [])];
    const clamped = Math.max(0, Math.min(index, children.length));
    children.splice(clamped, 0, node);
    return { ...parent, children };
  });
}

/** Append to a container, or to the nearest container ancestor if needed. */
export function appendNode(root: Node, parentId: string, node: Node): Node {
  const parent = findNode(root, parentId);
  const targetId = parent && canHaveChildren(parent.type) ? parentId : root.id;
  const target = findNode(root, targetId) ?? root;
  return insertNode(root, targetId, (target.children ?? []).length, node);
}

export function moveNode(
  root: Node,
  id: string,
  targetParentId: string,
  index: number,
): Node {
  const node = findNode(root, id);
  const targetParent = findNode(root, targetParentId);
  if (!node || !targetParent) return root;

  // Never move a node into itself or one of its own descendants.
  if (isSelfOrDescendant(node, targetParentId)) return root;
  if (!canHaveChildren(targetParent.type)) return root;

  const { root: without, removed } = removeNode(root, id);
  if (!removed) return root;

  return insertNode(without, targetParentId, index, removed);
}

/** Deep-clone a node (and its subtree) with fresh ids. */
export function cloneWithNewIds(node: Node, makeId: (type: NodeType) => string): Node {
  return {
    ...node,
    id: makeId(node.type),
    props: { ...node.props },
    style: node.style ? { ...node.style } : undefined,
    responsive: node.responsive ? { ...node.responsive } : undefined,
    children: node.children?.map((child) => cloneWithNewIds(child, makeId)),
  };
}

export type FlatNode = {
  node: Node;
  parentId: string | null;
  depth: number;
  index: number;
};

/** Depth-first flattening, used by the palette/inspector and for debugging. */
export function flatten(root: Node, parentId: string | null = null, depth = 0): FlatNode[] {
  const result: FlatNode[] = [{ node: root, parentId, depth, index: 0 }];
  (root.children ?? []).forEach((child, index) => {
    result.push(...flatten(child, root.id, depth + 1).map((entry, offset) =>
      offset === 0 ? { ...entry, index } : entry,
    ));
  });
  return result;
}
