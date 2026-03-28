import type { FastifyPluginAsync } from 'fastify';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { password: string } }>(
    '/api/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          properties: { password: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { password } = request.body;
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (!adminPassword) {
        return reply.code(500).send({ error: 'ADMIN_PASSWORD not configured' });
      }

      if (password !== adminPassword) {
        return reply.code(401).send({ error: 'Mot de passe incorrect' });
      }

      const token = fastify.jwt.sign({ role: 'admin' }, { expiresIn: '30d' });
      return { token };
    }
  );
};
