const jwt = require('jsonwebtoken')

const getTokens = ({ payload }) => {
    const accessToken = jwt.sign({ payload }, process.env.JWT_ACCESS_SECRET, {
        expiresIn: '10m'
    });

    const refreshToken = jwt.sign({ payload }, process.env.JWT_REFRESH_SECRET, {
        expiresIn: '30d'
    });

    return { accessToken, refreshToken }
}

const refreshToken = ({ token }) => {
    if (!token)
        throw new Error("Refresh token not found")

    const data = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    if(!data)
        throw new Error("Invalid or expired refresh token")

    return getTokens({
        payload: data.payload
    })
}

module.exports = {
    getTokens,
    refreshToken
}