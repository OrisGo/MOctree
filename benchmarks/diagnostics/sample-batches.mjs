// Recover sample provenance without changing the archived measurements.
export function sampleBatches(record, row) {
  const count = row.perBatch.length;
  if (!Number.isInteger(count) || count < 1 || row.rawMs.length !== record.options.samples)
    throw new Error('invalid batch/sample count');
  if (record.schema === 'contiguous-layout-v1') {
    const warmups = record.options.warmups;
    if (!Number.isSafeInteger(warmups) || warmups < 0)
      throw new Error('invalid legacy warmup count');
    return row.rawMs.map((_, i) => (i + warmups % count) % count);
  }
  let schedule;
  if (record.schema === 'contiguous-layout-v2') schedule = record.schedules?.[row.scenario];
  else if (record.schema === 'walkzzz-points-v1') schedule = record.schedules;
  else throw new Error(`unsupported measurement schema: ${record.schema}`);
  if (!Array.isArray(schedule) || schedule.length !== row.rawMs.length)
    throw new Error('missing or incomplete recorded schedule');
  return schedule.map(step => {
    if (!Number.isInteger(step.batch) || step.batch < 0 || step.batch >= count)
      throw new Error('invalid recorded batch');
    return step.batch;
  });
}
