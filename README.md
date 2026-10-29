# Fechamento de Faturamento (Unit of Work)

Continuação do projeto de faturamento do curso de Design Patterns do MBA Full Cycle.
O endpoint existente apenas calculava faturas e as descartava. Esta entrega adiciona o
**fechamento do faturamento**: uma operação que calcula as faturas de um período e as grava
no banco de forma **atômica** (tudo ou nada), com **reprocessamento substitutivo**, seleção
**dinâmica de presenter** (JSON/CSV), consulta das faturas fechadas e publicação de evento.

Stack mantida do projeto base: TypeScript, Express, pg-promise, Jest. Sem ORM, query builder
ou biblioteca de transação; a atomicidade é construída sobre o pg-promise através das portas
e adapters do próprio projeto.

## Pré-requisitos

- Node.js LTS recente (testado com Node 22).
- PostgreSQL com o usuário `postgres`, senha `123456` e banco `app`. A connection string está
  fixa em `src/infra/database/PgPromiseAdapter.ts`
  (`postgres://postgres:123456@localhost:5432/app`).
- A criação da extensão `uuid-ossp` exige um usuário com privilégio de superusuário (o `postgres`
  de uma instalação local ou do container oficial já o tem).

## Subindo o banco

```bash
# Os dois comandos abaixo são separados de propósito: DROP e CREATE DATABASE
# não podem ir na mesma string do psql.
psql -U postgres -c "drop database if exists app;"
psql -U postgres -c "create database app;"

# create.sql já cria a extensão uuid-ossp e usa "drop schema if exists",
# então roda limpo tanto num banco virgem quanto numa reexecução.
psql -U postgres -d app -v ON_ERROR_STOP=1 -f create.sql
```

O `create.sql` cria o schema `branas` com as tabelas `contract`, `payment` e `invoice`, e
insere o seed (um contrato de 6000 em 12 períodos a partir de 2022-01-01, com um pagamento de
6000 em 2022-01-05).

## Subindo a API

```bash
npm install
TZ=America/Sao_Paulo npx ts-node src/main.ts   # sobe na porta 3000
```

O timezone `America/Sao_Paulo` é obrigatório: as datas das respostas e dos testes dependem dele
(o projeto base assume esse TZ). Rode a API e a suíte sempre com `TZ=America/Sao_Paulo`.

> Se você recriar o schema (rodar o `create.sql`) com a API no ar, **reinicie a API** antes de
> continuar — um pool de conexões aberto antes do reseed pode pendurar requisições.

## Rodando os testes

```bash
TZ=America/Sao_Paulo npx jest
```

Os testes de integração (`GenerateInvoices`, `CloseInvoicing`, `Atomicity`, `Transaction`) usam
o banco real, e o teste de API (`api.test.ts`) exige a **API de pé**. Suba a API antes de rodar a
suíte. O `jest.config.js` usa `maxWorkers: 1` para serializar as suites que compartilham a tabela
`branas.invoice`.

## Endpoints

| Método | Rota                | Corpo / Query                                  | Resposta |
| ------ | ------------------- | ---------------------------------------------- | -------- |
| POST   | `/generate_invoices`| `{ month, year, type, format? }` (simulação)   | lista `{ date, amount }` ou CSV |
| POST   | `/close_invoicing`  | `{ month, year, type, format? }` (persiste)    | lista `{ date, amount }` ou CSV |
| GET    | `/invoices`         | `?month&year&type&format?`                     | lista `{ date, amount }` ou CSV |

- `format` ausente ou `"json"` → JSON; `"csv"` → texto puro `YYYY-MM-DD;amount` por linha;
  qualquer outro valor → `Error("Invalid format")`.
- `type` deve ser `cash` ou `accrual`; outro valor → `Error("Invalid type")`.
- `POST /generate_invoices` continua sendo **simulação**: não persiste nada.

### Exemplos

```bash
# Fechar por competência (JSON, padrão)
curl -s -X POST http://localhost:3000/close_invoicing \
  -H 'Content-Type: application/json' \
  -d '{"month":1,"year":2022,"type":"accrual"}'
# [{"date":"2022-01-01T13:00:00.000Z","amount":500}]

# Consultar o período fechado
curl -s "http://localhost:3000/invoices?month=1&year=2022&type=accrual"
# [{"date":"2022-01-01T13:00:00.000Z","amount":500}]

# Fechar por caixa em CSV (texto puro, sem aspas)
curl -s -X POST http://localhost:3000/close_invoicing \
  -H 'Content-Type: application/json' \
  -d '{"month":1,"year":2022,"type":"cash","format":"csv"}'
# 2022-01-05;6000
```

A cada fechamento, o resumo é publicado no evento `InvoicesClosed` e impresso no console da API
pelo `SendEmail`:

```
{ month: 1, year: 2022, type: 'accrual', invoices: 1, total: 500 }
```

## Onde vive a transação do fechamento (Unit of Work)

A transação é construída sobre o suporte nativo do pg-promise, respeitando a fronteira entre
camadas:

- A porta `DatabaseConnection` (`src/infra/database/DatabaseConnection.ts`) foi estendida com
  `transaction<T>(work)`, e o `PgPromiseAdapter` a implementa usando `connection.tx(...)`:
  commit ao final, rollback em qualquer exceção. A camada de aplicação **não** conhece
  `DatabaseConnection` nem o pg-promise.
- A porta de faturas `InvoiceRepository` expõe `replacePeriod(month, year, type, invoices)`. A
  implementação de banco (`src/infra/repository/InvoiceDatabaseRepository.ts`) executa a
  **remoção das faturas antigas do período/regime e a inserção das novas dentro de uma única
  transação** (`connection.transaction`). É o fechamento atômico e substitutivo: nunca duplica,
  nunca deixa pela metade.
- O caso de uso `CloseInvoicing` (`src/application/usecase/CloseInvoicing.ts`) orquestra: resolve
  o presenter pelo `format` **antes** de qualquer efeito (format inválido falha sem tocar o
  banco), reaproveita `contract.generateInvoices` (a regra de cálculo permanece no domínio),
  chama `replacePeriod`, publica `InvoicesClosed` e devolve o lote persistido.

### Como a atomicidade foi provada

`test/Atomicity.test.ts` fecha o período `accrual` de 01/2022 (1 fatura de 500, persistida) e
depois dispara um `replacePeriod` cujo lote tem, **no meio**, uma fatura com `id_contract`
inexistente (viola a FK `id_contract` da tabela `branas.invoice`). O insert falha, a transação
sofre **rollback total** e o teste verifica que o fechamento anterior (1 fatura de 500) permanece
intacto — nenhuma fatura do lote que falhou ficou no banco. `test/Transaction.test.ts` prova o
mesmo mecanismo no nível da conexão (commit efetiva 2 linhas; falha no meio deixa 0).

## Arquitetura e DIP

`src/domain` e `src/application` não importam nada de `src/infra`. Verificável com:

```bash
grep -rEn "from ['\"][^'\"]*infra" src/application src/domain   # volta vazio
```

As abstrações vivem na aplicação (`Mediator`, `Presenter`, `PresenterFactory`, `ContractRepository`,
`InvoiceRepository`); as implementações vivem na infra; o `main.ts` (Composition Root) injeta tudo.

## Checklist de Critérios de Aceite

**Fechamento e Unit of Work**

- [x] `POST /close_invoicing` persiste em `branas.invoice` e responde a lista das faturas.
- [x] `branas.invoice` segue o DDL fixado e `psql -v ON_ERROR_STOP=1 -d app -f create.sql` executa
  sem erro em banco virgem e em reexecução.
- [x] `DatabaseConnection.transaction` existe e o `PgPromiseAdapter` a implementa; pg-promise não
  aparece fora de `src/infra`.
- [x] Remoção das antigas e inserção das novas acontecem em uma única transação (`replacePeriod`).
- [x] Fechar duas vezes o mesmo período/regime não duplica (`CloseInvoicing.test.ts`).
- [x] Teste força falha no meio do lote e comprova rollback total (`Atomicity.test.ts`).

**Presenter e formato**

- [x] Porta `Presenter` generalizada; `JsonPresenter`/`CsvPresenter` sem mudança de comportamento.
- [x] A factory resolve json (default), csv e lança `Invalid format` (`PresenterFactory.test.ts`).
- [x] `format` funciona nos três endpoints; CSV em `YYYY-MM-DD;amount`.
- [x] `POST /generate_invoices` com `format: "csv"` responde CSV e não persiste nada.

**Consulta**

- [x] `HttpServer`/`ExpressAdapter` expõem a query string sem vazar Express (query = 4º argumento).
- [x] `GET /invoices?month&year&type` devolve as faturas via repositório e presenter; vazio → `[]`.

**Dependências e evento**

- [x] `grep -rEn "from ['\"][^'\"]*infra" src/application src/domain` volta vazio.
- [x] A abstração do `Mediator` vive em `src/application`; a implementação segue em `src/infra`.
- [x] `InvoicesClosed` publicado com `{ month, year, type, invoices, total }` e impresso pelo
  `SendEmail`.

**Testes e regressão**

- [x] Todos os testes novos obrigatórios existem e passam.
- [x] Os três arquivos de teste do professor mantêm asserts intactos (apenas montagem adaptada em
  `GenerateInvoices.test.ts`; `Contract.test.ts` e `api.test.ts` sem diff).
- [x] `TZ=America/Sao_Paulo npx jest` executa a suíte inteira verde (7 suites, 18 testes).
