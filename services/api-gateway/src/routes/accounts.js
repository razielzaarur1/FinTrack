import { z } from 'zod';
import { pool } from '../db.js';
import { vaultClient } from '../vault-client.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

const createAccountSchema = z.object({
  bankCompany: z.string().min(1, 'bankCompany is required'),
  displayName: z.string().optional(),
  credentials: z.record(z.any()).refine((val) => Object.keys(val).length > 0, {
    message: 'credentials object must not be empty',
  }),
});

export default async function accountsRoutes(fastify, options) {
  // GET /accounts - List active accounts for user
  fastify.get('/', async (request, reply) => {
    try {
      const result = await pool.query(
        `SELECT id, user_id, bank_company, display_name, is_active, last_scraped_at, created_at
         FROM bank_accounts
         WHERE user_id = $1 AND is_active = true
         ORDER BY created_at DESC`,
        [DEFAULT_USER_ID]
      );

      return reply.code(200).send(result.rows);
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch accounts');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });

  // POST /accounts - Create a new account with encrypted credentials
  fastify.post('/', async (request, reply) => {
    const parseResult = createAccountSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: parseResult.error.issues,
      });
    }

    const { bankCompany, credentials, displayName } = parseResult.data;

    try {
      // Encrypt credentials using Vault Transit Engine
      const ciphertext = await vaultClient.encryptCredentials(credentials);

      const result = await pool.query(
        `INSERT INTO bank_accounts (user_id, bank_company, encrypted_credentials, display_name, is_active, created_at)
         VALUES ($1, $2, $3, $4, true, NOW())
         RETURNING id, user_id, bank_company, display_name, is_active, created_at`,
        [DEFAULT_USER_ID, bankCompany, ciphertext, displayName || null]
      );

      return reply.code(201).send(result.rows[0]);
    } catch (err) {
      fastify.log.error(err, 'Failed to create account');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });

  // DELETE /accounts/:id - Soft delete account (is_active = false)
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const result = await pool.query(
        `UPDATE bank_accounts
         SET is_active = false
         WHERE id = $1 AND user_id = $2
         RETURNING id, user_id, bank_company, display_name, is_active`,
        [id, DEFAULT_USER_ID]
      );

      if (result.rowCount === 0) {
        return reply.code(404).send({ error: 'Not Found', message: 'Account not found' });
      }

      return reply.code(200).send({
        message: 'Account deactivated successfully',
        account: result.rows[0],
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to delete account');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });
}
