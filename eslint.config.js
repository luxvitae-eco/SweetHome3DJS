// eslint.config.js
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
    {
        rules: {
            'no-var': 'warn',
            'prefer-arrow-callback': 'warn',
            'no-undef': 'warn',
            'no-unused-vars': 'warn',
            // semi: "error",
            // "prefer-const": "error",
        },
        "ignores": ["public/**/*"],
        languageOptions: {
            globals: {
                ...globals.browser,
            },
        },
    },
]);
