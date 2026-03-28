import base from 'eslint-config-mourner';

export default [...base, {rules: {'@stylistic/quotes': ['error', 'single', {avoidEscape: true}]}}];
