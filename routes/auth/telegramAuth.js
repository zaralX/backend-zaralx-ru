'use strict'

const axios = require('axios');

module.exports = async function (fastify, opts) {
    fastify.post('/telegram/login', async function (request, reply) {
        const { id, first_name, username, photo_url, auth_date, hash } = request.body;

        if (!id || !hash) {
            return reply.status(400).send({ message: 'Missing required parameters' });
        }

        // Проверка Telegram-данных без использования crypto
        const secret = process.env.TELEGRAM_BOT_TOKEN; // Ваш Telegram Bot Token

        // Формируем строку для валидации
        const dataCheckString = Object.keys(request.body)
            .filter(key => key !== 'hash') // Убираем параметр 'hash'
            .sort()
            .map(key => `${key}=${request.body[key]}`)
            .join('\n');

        // Простое сравнение хэша с данными для проверки
        console.log(secret);
        const checkHash = generateTelegramHash(secret, dataCheckString); // Ваша функция для хэширования

        // Сравнение полученного хэша с тем, что Telegram передает
        if (checkHash !== hash) {
            return reply.status(403).send({ message: 'Invalid Telegram data' });
        }

        // Логика работы с пользователем, как в вашем коде
        const User = fastify.sequelize.model('User');

        // Проверяем, существует ли уже пользователь с этим Telegram ID
        let user = await User.findOne({ where: { telegramId: id } });

        if (!user) {
            // Если пользователя нет, проверяем связь с Discord
            const linkedUser = await User.findOne({
                where: { telegramId: null, discordId: request.body.discordId }
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

/**
 * Функция для генерации хэша с использованием секретного токена
 * @param {string} secret - секретный токен бота
 * @param {string} dataCheckString - строка для проверки
 * @returns {Uint8Array} - возвращает сгенерированный хэш
 */
function generateTelegramHash(secret, dataCheckString) {
    // Простой способ с использованием встроенных функций JS
    return new TextEncoder().encode(secret + dataCheckString); // Примерное решение без использования crypto
}
