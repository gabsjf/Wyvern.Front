# Wyvern · Front

Aplicativo Angular do Wyvern (gerenciador de campanhas de RPG). Tema visual "Bestiário", claro e escuro, responsivo para celular e desktop.

## Rodar localmente

Precisa do Node 22+ e, para dados reais, da API rodando (repositório `wyvern_`).

```bash
npm install
ng serve            # http://localhost:4200, usa a API em http://localhost:5098
```

A API em modo Development usa SQLite e uma chave JWT de desenvolvimento, sem nada para instalar:

```bash
dotnet run --project Wyvern.Api --no-launch-profile   # com ASPNETCORE_ENVIRONMENT=Development e ASPNETCORE_URLS=http://localhost:5098
```

`ng serve` usa `src/environments/environments.development.ts`; `ng build` usa `environments.ts` (produção).

## Testes e build

```bash
ng test --watch=false
ng build
```

## Organização

| Pasta | O que tem |
|---|---|
| `src/styles.scss` | Tokens do tema (cores, tipografia, espaçamento), botões, formulários, tabelas e utilidades. Nomes antigos de variáveis (`--primary-color`...) são aliases dos tokens novos. |
| `src/app/core` | Autenticação, interceptor, navegação, tema, painel, landing |
| `src/app/shared/ui` | Avisos (`ToastService`) e confirmações (`ConfirmService`): usar no lugar de `alert()` e `confirm()` |
| `src/app/campaigns` | Campanhas, membros, convites, `PapelService` (papel por campanha) |
| `src/app/personagens` | Lista, formulário, ficha |
| `src/app/sessoes` | Sessões, combate, anotações |

## Convenções do tema

- Cores só por token (`var(--fg)`, `var(--surface)`, `var(--accent)`, `var(--hi)`...). Nada de hex nos componentes, para o tema claro funcionar.
- `--accent` (vinho) é para preenchimento de ação; texto de destaque usa `--hi` (dourado).
- Números de jogo (PV, CA, modificadores) usam a classe `num` (fonte monoespaçada com algarismos tabulares).
- Alvos de toque com pelo menos 44 px; tabelas ganham `table-stack` para virar cartões no celular.