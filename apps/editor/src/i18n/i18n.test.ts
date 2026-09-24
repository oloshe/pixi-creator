import { describe, expect, it } from 'vitest';
import { translate } from './index';
import { zhCN } from './zh-CN';
import { en } from './en';

describe('i18n dictionaries', () => {
  it('keeps the zh-CN and en key sets identical', () => {
    const zhKeys = Object.keys(zhCN).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it('has no empty values in either dictionary', () => {
    for (const [key, value] of [...Object.entries(zhCN), ...Object.entries(en)]) {
      expect(value.length, key).toBeGreaterThan(0);
    }
  });

  it('translates for zh-CN and en', () => {
    expect(translate('zh-CN', 'tool.move')).toBe('移动');
    expect(translate('en', 'tool.move')).toBe('Move');
  });

  it('interpolates {name} placeholders', () => {
    expect(translate('en', 'inspector.removeComponent', { name: 'Button' })).toBe('Remove Button');
    expect(translate('zh-CN', 'inspector.removeComponent', { name: '按钮' })).toBe('移除 按钮');
  });

  it('falls back to the key for unknown keys', () => {
    expect(translate('zh-CN', 'unknown.key')).toBe('unknown.key');
  });
});
