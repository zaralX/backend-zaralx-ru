const { DataTypes, QueryTypes} = require('sequelize');

module.exports = async function (fastify, options) {
    const sequelize = fastify.sequelize;

    return sequelize.define('User', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        username: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        discordId: {
            type: DataTypes.BIGINT,
            allowNull: true,
            unique: true
        },
        telegramId: {
            type: DataTypes.BIGINT,
            allowNull: true,
            unique: true
        },
        email: {
            type: DataTypes.STRING,
            allowNull: true
        },
        password: {
            type: DataTypes.TEXT,
            allowNull: true
        },
    }, {
        tableName: 'users',
        timestamps: true
    });
}