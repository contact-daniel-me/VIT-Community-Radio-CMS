import { describe, expect, it } from 'vitest';
import { createTestDb, expectFailure } from '../harness/db';

describe('administrator user password management', () => {
  it('allows administrators to update user passwords and blocks non-admins', async () => {
    const db = await createTestDb();
    const admin = await db.createUser({ email: 'admin_pwd@vit.ac.in', fullName: 'Station Director', role: 'ADMIN' });
    const producer = await db.createUser({ email: 'prod_pwd@vit.ac.in', fullName: 'Station Producer', role: 'PRODUCER' });
    const rj = await db.createUser({ email: 'rj_pwd@vit.ac.in', fullName: 'RJ Sanjana', role: 'RJ' });

    // 1. Non-admin (RJ) cannot update passwords
    await expectFailure(
      () => db.asUser(rj, `select public.admin_set_user_password($1::uuid, $2)`, [producer, 'newpassword123']),
      /Only administrators can change user passwords/i,
    );

    // 2. Non-admin (Producer) cannot update passwords
    await expectFailure(
      () => db.asUser(producer, `select public.admin_set_user_password($1::uuid, $2)`, [rj, 'newpassword123']),
      /Only administrators can change user passwords/i,
    );

    // 3. Password length < 8 is rejected
    await expectFailure(
      () => db.asUser(admin, `select public.admin_set_user_password($1::uuid, $2)`, [rj, 'short']),
      /Password must be at least 8 characters long/i,
    );

    // 4. Non-existent user is rejected
    await expectFailure(
      () => db.asUser(admin, `select public.admin_set_user_password($1::uuid, $2)`, ['00000000-0000-0000-0000-000000000000', 'newpassword123']),
      /User not found/i,
    );

    // 5. Admin updates RJ's password successfully
    const [result] = await db.asUser<{ admin_set_user_password: { id: string; email: string; full_name: string } }>(
      admin,
      `select public.admin_set_user_password($1::uuid, $2)`,
      [rj, 'supersecretpassword2026'],
    );
    expect(result.admin_set_user_password.email).toBe('rj_pwd@vit.ac.in');
    expect(result.admin_set_user_password.full_name).toBe('RJ Sanjana');

    // Verify auth.users was updated with hashed password
    const [authUser] = await db.sql<{ encrypted_password: string }>(
      `select encrypted_password from auth.users where id = $1::uuid`,
      [rj],
    );
    expect(authUser.encrypted_password).toBeDefined();
    expect(authUser.encrypted_password).toContain('stub$test-salt-bf$');

    // Verify activity log was recorded
    const logs = await db.sql<{ action: string; metadata: any }>(
      `select action, metadata from public.activity_logs where entity_id = $1::uuid and action = 'PASSWORD_RESET'`,
      [rj],
    );
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].action).toBe('PASSWORD_RESET');
    expect(logs[0].metadata.target_email).toBe('rj_pwd@vit.ac.in');

    // 6. Admin can also update their own password
    const [adminResult] = await db.asUser<{ admin_set_user_password: { id: string; email: string; full_name: string } }>(
      admin,
      `select public.admin_set_user_password($1::uuid, $2)`,
      [admin, 'directorpassword999'],
    );
    expect(adminResult.admin_set_user_password.id).toBe(admin);

    await db.close();
  });
});
