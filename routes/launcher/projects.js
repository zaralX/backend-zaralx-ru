'use strict'

module.exports = async function (fastify, opts) {
    fastify.get('/projects', async function (request, reply) {
        const LauncherProject = fastify.sequelize.model('LauncherProject');
        const LauncherProjectVersion = fastify.sequelize.model('LauncherProjectVersion');

        const projects = await LauncherProject.findAll({
            include: {
                model: LauncherProjectVersion,
                as: 'versions'
            }
        })

        return reply.status(200).send({projects});
    })

    fastify.get('/project/:id', async function (request, reply) {
        const LauncherProject = fastify.sequelize.model('LauncherProject');
        const LauncherProjectVersion = fastify.sequelize.model('LauncherProjectVersion');

        const project = await LauncherProject.findOne({
            id: request.params.id,
            include: {
                model: LauncherProjectVersion,
                as: 'versions'
            }
        })

        return reply.status(200).send(project);
    })

    fastify.get('/version/:id', async function (request, reply) {
        const LauncherProjectVersion = fastify.sequelize.model('LauncherProjectVersion');

        const version = await LauncherProjectVersion.findOne({
            id: request.params.id
        })

        return reply.status(200).send(version);
    })
}
