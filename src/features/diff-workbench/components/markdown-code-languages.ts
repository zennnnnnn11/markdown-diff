import { LanguageDescription } from '@codemirror/language'

let commonCodeLanguagesPromise: Promise<LanguageDescription[]> | undefined

export function loadCommonCodeLanguages(): Promise<LanguageDescription[]> {
  commonCodeLanguagesPromise ??= Promise.resolve([
    LanguageDescription.of({
      name: 'JavaScript',
      alias: ['javascript', 'js'],
      extensions: ['js', 'mjs', 'cjs'],
      load: () => import('@codemirror/lang-javascript').then((module) => module.javascript()),
    }),
    LanguageDescription.of({
      name: 'TypeScript',
      alias: ['typescript', 'ts'],
      extensions: ['ts', 'mts', 'cts'],
      load: () =>
        import('@codemirror/lang-javascript').then((module) =>
          module.javascript({ typescript: true }),
        ),
    }),
    LanguageDescription.of({
      name: 'JSX',
      alias: ['jsx'],
      extensions: ['jsx'],
      load: () =>
        import('@codemirror/lang-javascript').then((module) =>
          module.javascript({ jsx: true }),
        ),
    }),
    LanguageDescription.of({
      name: 'TSX',
      alias: ['tsx'],
      extensions: ['tsx'],
      load: () =>
        import('@codemirror/lang-javascript').then((module) =>
          module.javascript({ jsx: true, typescript: true }),
        ),
    }),
    LanguageDescription.of({
      name: 'JSON',
      alias: ['json'],
      extensions: ['json'],
      load: () =>
        import('@codemirror/lang-javascript').then((module) =>
          module.javascript(),
        ),
    }),
    LanguageDescription.of({
      name: 'HTML',
      alias: ['html', 'htm'],
      extensions: ['html', 'htm'],
      load: () => import('@codemirror/lang-html').then((module) => module.html()),
    }),
    LanguageDescription.of({
      name: 'CSS',
      alias: ['css'],
      extensions: ['css'],
      load: () => import('@codemirror/lang-css').then((module) => module.css()),
    }),
    LanguageDescription.of({
      name: 'SQL',
      alias: ['sql'],
      extensions: ['sql'],
      load: () => import('@codemirror/lang-sql').then((module) => module.sql()),
    }),
    LanguageDescription.of({
      name: 'YAML',
      alias: ['yaml', 'yml'],
      extensions: ['yaml', 'yml'],
      load: () => import('@codemirror/lang-yaml').then((module) => module.yaml()),
    }),
    LanguageDescription.of({
      name: 'Python',
      alias: ['python', 'py'],
      extensions: ['py'],
      load: () => import('@codemirror/lang-python').then((module) => module.python()),
    }),
  ])

  return commonCodeLanguagesPromise
}
