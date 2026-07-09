// Run with: npm test  (node's built-in test runner — no dependencies).
// This suite is the mobile-side pin on the cross-repo Drive contract; its
// mirror lives in review-ui/src/lib/__tests__/driveProps.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  packProps,
  unpackProps,
  salvageJsonArray,
  PROP_VALUE_LIMIT,
  PROP_COUNT_LIMIT,
  MAX_FILENAME_LENGTH,
} from '../driveProps.js';

const byteLen = (s) => Buffer.byteLength(s, 'utf8');
const here = path.dirname(fileURLToPath(import.meta.url));

test('small values pass through untouched', () => {
  assert.deepEqual(packProps({ box: '3', tags: '["Letters"]' }), {
    box: '3',
    tags: '["Letters"]',
  });
});

test('an oversized typed_comments chunks under the 124-byte cap and round-trips losslessly', () => {
  const long = JSON.stringify([
    { page: 0, text: 'Water damage along the whole left edge, worst at the bottom corner' },
    { page: 1, text: 'Second page has a partial date stamp, maybe 1942?' },
    { page: 2, text: 'Handwriting switches mid-page — different author?' },
  ]);
  const packed = packProps({ typed_comments: long });
  assert.ok(Object.keys(packed).length > 1, 'expected continuation keys');
  for (const [k, v] of Object.entries(packed)) {
    assert.ok(byteLen(k) + byteLen(v) <= PROP_VALUE_LIMIT, `${k} is over the cap`);
  }
  assert.equal(unpackProps(packed).typed_comments, long);
});

test('multi-byte characters never split across chunks', () => {
  const val = '§¶å'.repeat(80);
  assert.equal(unpackProps(packProps({ note: val })).note, val);
});

test('packing more than the ~30-property ceiling throws loudly instead of a silent 403 later', () => {
  const props = {};
  for (let i = 0; i <= PROP_COUNT_LIMIT; i++) props[`k${i}`] = 'v';
  assert.throws(() => packProps(props), /ceiling/);
});

test('salvageJsonArray recovers the complete entries of a truncated value', () => {
  const full = [
    { page: 0, text: 'first note' },
    { page: 1, text: 'second note, this one gets cut' },
  ];
  const json = JSON.stringify(full);
  const truncated = `${json.slice(0, json.indexOf('gets cut'))}…`;
  assert.deepEqual(salvageJsonArray(truncated), [full[0]]);
});

test('MAX_FILENAME_LENGTH is 100 — the incident value; change it in BOTH repos or not at all', () => {
  assert.equal(MAX_FILENAME_LENGTH, 100);
});

test('driveProps.js is byte-identical to review-ui/src/lib/driveProps.js', (t) => {
  const ours = path.resolve(here, '../driveProps.js');
  const theirs = path.resolve(here, '../../../../review-ui/src/lib/driveProps.js');
  if (!fs.existsSync(theirs)) {
    t.skip('review-ui repo not checked out next to this one');
    return;
  }
  assert.equal(
    fs.readFileSync(ours, 'utf8'),
    fs.readFileSync(theirs, 'utf8'),
    'The two repos\' driveProps.js copies have drifted — copy the edited one over the other ' +
      'and re-run both test suites.'
  );
});

test('ConfirmationScreen imports the shared filename cap instead of re-declaring it', () => {
  const src = fs.readFileSync(
    path.resolve(here, '../../screens/ConfirmationScreen.js'),
    'utf8'
  );
  assert.match(src, /import\s*\{[^}]*MAX_FILENAME_LENGTH[^}]*\}\s*from\s*'\.\.\/utils\/driveProps'/);
  assert.doesNotMatch(
    src,
    /const\s+MAX_FILENAME_LENGTH\s*=/,
    'ConfirmationScreen re-declares MAX_FILENAME_LENGTH — that literal drifting between repos caused a real incident'
  );
});

test('DriveService flattens metadata through the shared packProps (no lossy truncation)', () => {
  const src = fs.readFileSync(
    path.resolve(here, '../../services/DriveService.js'),
    'utf8'
  );
  assert.match(src, /import\s*\{[^}]*packProps[^}]*\}\s*from\s*'\.\.\/utils\/driveProps'/);
  assert.doesNotMatch(src, /truncateForDriveProperty/);
});
