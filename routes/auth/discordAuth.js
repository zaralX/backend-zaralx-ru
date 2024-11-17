'use strict'

const DiscordOauth2 = require("discord-oauth2");

module.exports = async function (fastify, opts) {
  fastify.post('/discord/login', async function (request, reply) {
    if (!request.body.code) {
      reply.status(400).send({message: 'Code is required'});
    }

    const oauth = new DiscordOauth2();

    const discordTokens = await oauth.tokenRequest({
      clientId: process.env.DISCORD_ID,
      clientSecret: process.env.DISCORD_SECRET,

      code: request.body.code,
      scope: "identify email",
      grantType: "authorization_code",

      redirectUri: process.env.DISCORD_REDIRECT,
    })

    if (discordTokens === null) {
      return reply.status(500).send({message: 'Failed to get discord token'});
    }

    const {access_token} = discordTokens;

    const discordUserData = await oauth.getUser(access_token).catch(() => {reply.status(500).send(
        {message: 'Failed to fetch discord user data'});}
    )

    if (discordUserData.verified === null) {
      return reply.status(500).send({message: 'Ваш адрес электоронной почты не подтверждён в Discord'});
    }

    const User = fastify.sequelize.model('User');

    const [user, created] = await User.findOrCreate({
      where: {
        discordId: discordUserData.id,
      },
      defaults: {
        discordId: discordUserData.id,
        email: discordUserData.email
      }
    })

    const tokens = {
      access_token: fastify.jwt.sign({
          id: user.id
      }, {expiresIn: '15m'}),
      refresh_token: fastify.jwt.sign({
        id: user.id
      }, {expiresIn: '30d'})
    }

    reply.setCookie("access_token", tokens.access_token, {
      maxAge: 60 * 15,
      path: '/'
    })

    reply.setCookie("refresh_token", tokens.refresh_token, {
      maxAge: 60 * 60 * 24 * 30,
      path: '/'
    })

    return reply.status(200).send({
      user,
      tokens,
      message: "Успешный вход!"
    });
  })
}
