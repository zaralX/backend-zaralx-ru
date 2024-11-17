const { DataTypes, QueryTypes} = require('sequelize');

module.exports = async function (fastify, options) {
    const sequelize = fastify.sequelize;

    return sequelize.define('ProjectTag', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        key: {
            type: DataTypes.STRING,
        },
        name: {
            type: DataTypes.STRING,
        },
        icon: {
            type: DataTypes.TEXT,
        },
        classes: {
            type: DataTypes.STRING,
        }
    }, {
        tableName: 'projectTags',
        timestamps: false
    });
}