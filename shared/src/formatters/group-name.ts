export function fullGroupName(group: { ordinal: number; name: string | null }) {
  return `第${group.ordinal}組${group.name ? '-' + group.name : ''}`;
}
