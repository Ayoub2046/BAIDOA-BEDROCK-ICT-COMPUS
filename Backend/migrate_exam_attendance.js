// Backend/migrate_exam_attendance.js
const { query } = require('./database');

async function runMigration() {
  console.log('--- Starting Exam Attendance Migration ---');

  try {
    // 1. Create exam_attendance table
    await query(`
      CREATE TABLE IF NOT EXISTS exam_attendance (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        academic_year VARCHAR(50) NOT NULL DEFAULT '2026',
        class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
        period_id INTEGER REFERENCES exam_periods(id) ON DELETE SET NULL,
        subject VARCHAR(150) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'attended',
        notes TEXT,
        recorded_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ exam_attendance table created or verified.');

    // Unique index on exam_attendance
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_attendance_record
      ON exam_attendance (student_id, COALESCE(period_id, 0), LOWER(subject), COALESCE(class_id, 0))
    `);
    console.log('✓ uq_exam_attendance_record index created.');

    // 2. Add unique index on results to prevent duplicates
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_results_student_subject_part_period
      ON results (student_id, LOWER(subject), exam_type, COALESCE(period_id, 0))
      WHERE deleted_at IS NULL
    `);
    console.log('✓ uq_results_student_subject_part_period index created.');

    // 3. Inspect existing results
    const { rows: allResults } = await query(`
      SELECT r.id, r.student_id, s.name, s.classid, r.subject, r.exam_type, r.score, r.period_id, r.academic_year
      FROM results r
      JOIN students s ON s.id = r.student_id
      WHERE r.deleted_at IS NULL
      ORDER BY r.student_id, r.period_id, r.subject
    `);

    // Group by student_id + period_id + subject
    const grouped = {};
    allResults.forEach(r => {
      const key = `${r.student_id}_${r.period_id}_${r.subject.toLowerCase()}`;
      if (!grouped[key]) {
        grouped[key] = {
          student_id: r.student_id,
          name: r.name,
          class_id: r.classid,
          period_id: r.period_id,
          academic_year: r.academic_year || '2026',
          subject: r.subject,
          scores: [],
          resultIds: []
        };
      }
      grouped[key].scores.push(parseFloat(r.score) || 0);
      grouped[key].resultIds.push(r.id);
    });

    console.log(`\nFound ${Object.keys(grouped).length} distinct student exam entries.`);

    let attendedCount = 0;
    let absentCount = 0;

    for (const key of Object.keys(grouped)) {
      const g = grouped[key];
      const totalScore = g.scores.reduce((a, b) => a + b, 0);
      const isAllZero = g.scores.length > 0 && totalScore === 0;

      if (isAllZero) {
        // Students with 0 across all parts who did not attend
        console.log(`[ABSENT / DID NOT ATTEND] Student ID ${g.student_id} (${g.name}) in Class ${g.class_id}, Period ${g.period_id}, Subj: ${g.subject}`);
        
        // Upsert exam_attendance as 'did_not_attend'
        await query(`
          INSERT INTO exam_attendance (student_id, academic_year, class_id, period_id, subject, status, notes, recorded_by)
          VALUES ($1, $2, $3, $4, $5, 'did_not_attend', 'Did not attend exam', 'System Migration')
          ON CONFLICT (student_id, COALESCE(period_id, 0), LOWER(subject), COALESCE(class_id, 0))
          DO UPDATE SET status = 'did_not_attend', updated_at = NOW()
        `, [g.student_id, g.academic_year, g.class_id, g.period_id, g.subject]);

        // Soft delete fake 0/100 results so they don't pollute approved results
        await query(`
          UPDATE results
          SET deleted_at = NOW()
          WHERE id = ANY($1::int[])
        `, [g.resultIds]);

        absentCount++;
      } else {
        // Legitimate attendance
        console.log(`[ATTENDED] Student ID ${g.student_id} (${g.name}) - Total Score: ${totalScore}`);
        
        await query(`
          INSERT INTO exam_attendance (student_id, academic_year, class_id, period_id, subject, status, notes, recorded_by)
          VALUES ($1, $2, $3, $4, $5, 'attended', 'Attended and scored', 'System Migration')
          ON CONFLICT (student_id, COALESCE(period_id, 0), LOWER(subject), COALESCE(class_id, 0))
          DO UPDATE SET status = 'attended', updated_at = NOW()
        `, [g.student_id, g.academic_year, g.class_id, g.period_id, g.subject]);

        attendedCount++;
      }
    }

    // 4. Also register any remaining active students who have no results at all in Class 3 / Period 3
    const { rows: unrecordedStudents } = await query(`
      SELECT s.id, s.name, s.classid
      FROM students s
      WHERE s.deleted_at IS NULL
        AND s.id NOT IN (SELECT student_id FROM exam_attendance)
    `);

    for (const s of unrecordedStudents) {
      console.log(`[UNRECORDED / DID NOT ATTEND] Student ID ${s.id} (${s.name}) in Class ${s.classid}`);
      const periodId = s.classid === 3 ? 3 : 1;
      const subj = s.classid === 2 ? 'WINDOW' : 'BASIC COMPUTER';
      await query(`
        INSERT INTO exam_attendance (student_id, academic_year, class_id, period_id, subject, status, notes, recorded_by)
        VALUES ($1, '2026', $2, $3, $4, 'did_not_attend', 'No exam submission recorded', 'System Migration')
        ON CONFLICT (student_id, COALESCE(period_id, 0), LOWER(subject), COALESCE(class_id, 0))
        DO NOTHING
      `, [s.id, s.classid, periodId, subj]);
      absentCount++;
    }

    console.log(`\nMigration completed successfully!`);
    console.log(`- Attended students recorded: ${attendedCount}`);
    console.log(`- Absent / Did not attend recorded: ${absentCount}`);
    console.log(`- Total students accounted for: ${attendedCount + absentCount}`);

    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

runMigration();
