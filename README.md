# scrapbook-ui

Interface React e TypeScript em português. Usar Node 26.13.0 e npm 11.20.0.

```sh
npm ci
npm run check
npm run dev
```

A tela inicial do ambiente local pode consultar a prontidão por ação explícita. O Vite encaminha a consulta ao backend local em `127.0.0.1:5080`. Para habilitar o controle no servidor de desenvolvimento, iniciar com `VITE_ENABLE_LOCAL_DIAGNOSTICS=true`. Essa opção de build é pública. O [Compose](../scrapbook-infrastructure/README.md) habilita o controle e publica a UI com proxy Nginx no mesmo endereço de origem.
