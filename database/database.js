async function setupDatabase(fastify) {
    const UserModel = await require('./models/User')(fastify);
    const LauncherProject = await require('./models/LauncherProject')(fastify);
    const LauncherProjectVersion = await require('./models/LauncherProjectVersion')(fastify);

    LauncherProject.hasMany(LauncherProjectVersion, { foreignKey: 'projectId', as: 'versions' });
    LauncherProjectVersion.belongsTo(LauncherProject, { foreignKey: 'projectId', as: 'project' });

    fastify.sequelize.sync({force: false})
        .then(async () => {
            console.log("Database synchronized successfully")
        })
        .catch(err => console.error("Error synchronizing database:", err));
}

module.exports = { setupDatabase }