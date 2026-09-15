import { createTestDb } from './tests/harness/db.js';

async function main() {
  const db = await createTestDb();
  const producer = await db.createUser({ email: 'p@vit.ac.in', fullName: 'Producer', role: 'PRODUCER' });
  const rj = await db.createUser({ email: 'r@vit.ac.in', fullName: 'RJ Sneha', role: 'RJ' });

  console.log("Producer ID:", producer);
  console.log("RJ ID:", rj);

  const progRows = await db.asUser(producer, `insert into public.programs (name, description, host_name, category, created_by) values ('Test Prog', 'Desc', 'Host', 'CAMPUS NEWS', $1) returning id`, [producer]);
  const programId = (progRows[0] as any).id;
  console.log("Program ID:", programId);

  try {
    const epRows = await db.asUser(rj, `insert into public.episodes (program_id, title, description, episode_number, host_name, assigned_rj, created_by) values ($1, 'Test Ep', 'Desc', 12, 'Host', $2, $2) returning id, status, episode_id`, [programId, rj]);
    console.log("Insert returned:", epRows);

    const check = await db.asUser(rj, `select * from public.episodes`);
    console.log("All episodes for RJ:", check);

    // Call submit directly
    const submit = await db.asUser(rj, `select * from public.submit_episode_for_qc($1)`, [(epRows[0] as any).id]);
    console.log("Submit result:", submit);
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}

main().catch(console.error);
