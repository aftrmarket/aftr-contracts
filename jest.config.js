// jest.config.js

export default {
    transformIgnorePatterns: ['node_modules/(?!(sucrase)/)'],
    transform: {
        '^.+\\.(js|jsx|ts|tsx|mjs)$': 'ts-jest',
    },
    // ...the rest of your config
}
