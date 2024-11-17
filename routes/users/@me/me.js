'use strict'

module.exports = async function (fastify, opts) {
    fastify.addHook('onRequest', async (request, reply) => {
        try {
            const accessToken = request.cookies.access_token
            if (!accessToken) {
                return reply.status(401).send({ error: 'Missing access token' })
            }

            request.user = fastify.jwt.verify(accessToken)
        } catch (err) {
            reply.status(401).send({ error: 'Unauthorized' })
        }
    })

    fastify.post('/refresh', async (request, reply) => {
        try {
            const refreshToken = request.cookies.refresh_token
            if (!refreshToken) {
                return reply.status(400).send({ error: 'Missing refresh token' })
            }

            const decoded = fastify.jwt.verify(refreshToken)
            const accessToken = fastify.jwt.sign({id: decoded.id}, {expiresIn: '15m'}) // Создаем новый access токен

            reply.setCookie("access_token", accessToken, {
                maxAge: 60 * 10,
                path: '/'
            })

            return reply.status(200).send();
        } catch (err) {
            return reply.status(401).send({error: 'Invalid refresh token'})
        }
    })

    fastify.post('/logout', async function (request, reply) {
        reply.clearCookie("access_token", {
            path: '/'
        })

        reply.clearCookie("refresh_token", {
            path: '/'
        })

        return reply.status(200).send();
    })

    fastify.post('/delete', async function (request, reply) {
        const User = fastify.sequelize.model('User');
        await User.destroy({
            where: {
                id: request.user.id
            }
        })

        return reply.status(200).send();
    })
}
