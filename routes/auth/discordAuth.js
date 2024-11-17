'use strict';

const axios = require('axios');

module.exports = async function (fastify, opts) {
  fastify.post('/discord/login', async function (request, reply) {
    const User = fastify.sequelize.model('User');

    checkAccount: try {
      const accessToken = request.cookies.access_token;
      if (!accessToken) {
        break checkAccount;
      }

      const userJwtData = fastify.jwt.verify(accessToken);
      request.user = await User.findOne({ where: { id: userJwtData.id } });
    } catch (err) {}

    const { code } = request.body;

    if (!code) {
      return reply.status(400).send({ message: 'Code is required' });
    }

    try {
      // Получение токена Discord
      const tokenResponse = await axios.post(
          'https://discord.com/api/oauth2/token',
          new URLSearchParams({
            client_id: process.env.DISCORD_ID,
            client_secret: process.env.DISCORD_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: process.env.DISCORD_REDIRECT,
            scope: 'identify email',
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
      );

      const { access_token } = tokenResponse.data;

      // Получение данных пользователя из Discord
      const userResponse = await axios.get('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      const discordUserData = userResponse.data;

      if (!discordUserData.verified) {
        return reply.status(400).send({ message: 'Email в Discord не подтвержден' });
      }

      // Поиск пользователя по Discord ID
      let user = await User.findOne({ where: { discordId: discordUserData.id } });

      if (!user) {
        // Ищем аккаунт для привязки
        user = await User.findOne({ where: { id: request.user.id } });

        if (user) {
          // Привязываем Discord ID к существующему аккаунту Telegram
          user.discordId = discordUserData.id;
          if (user.email === null && discordUserData.email !== null) {
            user.email = discordUserData.email;
          }
          await user.save();
        } else {
          if (request.user) {
            return reply.status(400).send({ message: 'Не получилось привязать аккаунт к существующему' });
          }
          // Создаем нового пользователя
          user = await User.create({
            discordId: discordUserData.id,
            email: discordUserData.email,
            username: discordUserData.username,
          });
        }
      }

      // Генерация токенов
      const tokens = {
        access_token: fastify.jwt.sign({ id: user.id, discordId: user.discordId, telegramId: user.telegramId }, { expiresIn: '15m' }),
        refresh_token: fastify.jwt.sign({ id: user.id, discordId: user.discordId, telegramId: user.telegramId }, { expiresIn: '30d' }),
      };

      // Установка куков
      reply.setCookie('access_token', tokens.access_token, {
        maxAge: 60 * 15,
        path: '/',
        httpOnly: true,
        secure: true,
      });

      reply.setCookie('refresh_token', tokens.refresh_token, {
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
        httpOnly: true,
        secure: true,
      });

      // Возврат данных
      return reply.status(200).send({
        user,
        tokens,
        message: 'Успешный вход через Discord!',
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ message: 'Ошибка авторизации через Discord', error });
    }
  });
};
