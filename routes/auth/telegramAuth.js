'use strict'

const axios = require('axios');
const crypto = require('crypto');

module.exports = async function (fastify, opts) {
    fastify.post('/telegram/login', async function (request, reply) {
        const { id, first_name, username, photo_url, auth_date, hash } = request.body;

        if (!id || !hash) {
            return reply.status(400).send({ message: 'Missing required parameters' });
        }

        // Проверяем данные Telegram (реализация проверки хэша зависит от Bot Token)
        const secret = crypto.createHash('sha256')
            .update(process.env.TELEGRAM_BOT_TOKEN)
            .digest();

        const dataCheckString = Object.keys(request.body)
            .filter(key => key !== 'hash')
            .sort()
            .map(key => `${key}=${request.body[key]}`)
            .join('\n');

        const checkHash = crypto.createHmac('sha256', secret)
            .update(dataCheckString)
            .digest('hex');

        if (checkHash !== hash) {
            return reply.status(403).send({ message: 'Invalid Telegram data' });
        }

        const User = fastify.sequelize.model('User');

        // Проверяем, существует ли уже пользователь с этим Telegram ID
        let user = await User.findOne({ where: { telegramId: id } });

        if (!user) {
            // Если пользователя нет, проверяем связь с Discord
            const linkedUser = await User.findOne({
                where: { telegramId: null, discordId: request?.body?.discordId ?? -1 }
            });

            if (linkedUser) {
                // Привязываем Telegram к существующему аккаунту Discord
                user = linkedUser;
                user.telegramId = id;
                await user.save();
            } else {
                // Создаем нового пользователя
                user = await User.create({
                    telegramId: id,
                    username: username,
                    photoUrl: photo_url,
                });
            }
        }

        const tokens = {
            access_token: fastify.jwt.sign({ id: user.id }, { expiresIn: '15m' }),
            refresh_token: fastify.jwt.sign({ id: user.id }, { expiresIn: '30d' })
        };

        reply.setCookie("access_token", tokens.access_token, {
            maxAge: 60 * 15,
            path: '/'
        });

        reply.setCookie("refresh_token", tokens.refresh_token, {
            maxAge: 60 * 60 * 24 * 30,
            path: '/'
        });

        return reply.status(200).send({
            user,
            tokens,
            message: "Успешный вход через Telegram!"
        });
    });
}
