const { query } = require('./database.js');

async function run() {
  try {
    const existing = await query('SELECT * FROM exam_periods WHERE deleted_at IS NULL');
    let pId;
    if (existing.rows.length === 0) {
      const ins = await query(`
        INSERT INTO exam_periods (name, year, month, period_type, academic_year, is_active, is_archived)
        VALUES 
          ('August 2026', 2026, 8, 'monthly', '2026', true, false),
          ('September 2026', 2026, 9, 'monthly', '2026', true, false)
        RETURNING id, name
      `);
      console.log('Created exam periods:', ins.rows);
      pId = ins.rows[0].id;
    } else {
      pId = existing.rows[0].id;
      console.log('Existing exam periods:', existing.rows);
    }
    
    const upd = await query('UPDATE results SET period_id = $1 WHERE period_id IS NULL RETURNING id', [pId]);
    console.log('Updated results count with period_id:', upd.rowCount);
  } catch(e) {
    console.error('Error seeding exam periods:', e);
  } finally {
    process.exit();
  }
}

run();
