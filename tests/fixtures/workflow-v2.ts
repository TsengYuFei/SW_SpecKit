import { sampleSheet } from './guided-notes.js';

export function workflowV2Sheets() {
  return [
    { ...sampleSheet(17), index: 0, hidden: false, sheetType: 'GRID' as const },
    { ...sampleSheet(29, 2, 1), index: 1, hidden: false, sheetType: 'GRID' as const },
  ];
}

export const workflowV2Names = {
  normal: '咕咕嘎嘎',
  boundary: '名'.repeat(40),
  tooLong: '名'.repeat(41),
  escaped: '<script>測試純文字</script>',
} as const;
