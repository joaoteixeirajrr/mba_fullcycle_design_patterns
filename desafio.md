# Fechamento de Faturamento: do cálculo descartável à persistência atômica

## Descrição

O sistema de faturamento que você acompanhou ao longo do curso calcula as faturas de um contrato por regime de caixa ou de competência, aplicando na prática os padrões apresentados: DTO, Repository, Adapter, Strategy, Dynamic Factory, Presenter, Decorator, Controller, Composition Root e Mediator. Só que ele tem uma limitação de produto que salta aos olhos de qualquer pessoa de negócio: as faturas são calculadas, devolvidas na resposta HTTP e descartadas. Nada é persistido. O endpoint existente é, na prática, uma simulação.

Sua missão é dar continuidade ao projeto do professor e implementar o fechamento do faturamento: uma operação que calcula as faturas de um período e as grava no banco de forma atômica, tudo ou nada. Se qualquer fatura do lote falhar ao persistir, nenhuma pode ficar gravada. E se o mesmo período for fechado de novo, o fechamento anterior daquele período e regime é substituído por inteiro, dentro da mesma transação, sem nunca duplicar faturas.

A tensão central do desafio é essa atomicidade: o projeto hoje não tem nenhum mecanismo de transação, a interface DatabaseConnection só sabe executar uma query por vez. É você quem vai construir essa capacidade, no espírito do Unit of Work do capítulo de Patterns of Enterprise Application Architecture, e provar que ela funciona com um teste que força uma falha no meio do lote. No caminho, você vai ressuscitar um campo morto do Input (o format, que hoje é ignorado) com uma Dynamic Factory de presenters, evoluir o Adapter HTTP para expor a query string da consulta e corrigir violações de dependência que existem no próprio código final do curso.

## Objetivo

Entregar, em um fork público do repositório base, o seguinte pacote:

- O caso de uso de fechamento do faturamento, exposto em `POST /close_invoicing`, persistindo as faturas do período de forma atômica (Unit of Work) e com reprocessamento substitutivo.
- A tabela `branas.invoice` e o `create.sql` atualizado, executando limpo em um PostgreSQL virgem.
- Seleção dinâmica de presenter (JSON ou CSV) pelo campo `format`, via Dynamic Factory, valendo para o endpoint existente e para os novos.
- A consulta `GET /invoices` das faturas fechadas de um período, com a evolução do HttpServer para expor query string.
- O evento `InvoicesClosed` publicado via Mediator com o resumo do fechamento, tendo o SendEmail como listener.
- A correção das violações de DIP existentes na camada de aplicação.
- A suíte de testes cobrindo tudo isso, com a suíte existente do professor continuando a passar.

## Repositório base

- Repositório: [https://github.com/devfullcycle/mba_fullcycle_design_patterns](https://github.com/devfullcycle/mba_fullcycle_design_patterns)
- Branch de partida: master
- Entrega: fork público, com tudo consolidado na branch main do seu fork.

**Como subir o projeto base (fluxo verificado):**

```
# PostgreSQL local com usuário postgres, senha 123456, banco app
# (a connection string está fixa em src/infra/database/PgPromiseAdapter.ts)
psql -U postgres -c "create database app;"
psql -U postgres -d app -c 'create extension if not exists "uuid-ossp";'
psql -U postgres -d app -f create.sql

npm install
TZ=America/Sao_Paulo npx ts-node src/main.ts        # sobe a API na porta 3000
TZ=America/Sao_Paulo npx jest                       # roda a suíte
```

**Atritos conhecidos do projeto base, para você não travar no primeiro minuto:**

- O `create.sql` usa `uuid_generate_v4()` mas não cria a extensão `uuid-ossp`. Em um PostgreSQL virgem, sem a extensão, a criação das tabelas falha. Criar a extensão antes (comando acima) resolve; corrigir isso no próprio `create.sql` faz parte do desafio.
- Na primeira execução, o `drop schema branas cascade;` do `create.sql` emite um erro porque o schema ainda não existe. O psql segue em frente e o restante executa normalmente.
- A suíte de testes do professor pressupõe o timezone America/Sao_Paulo: as datas esperadas nos asserts (ex.: `2022-01-05T13:00:00.000Z`) são a conversão de horários locais de São Paulo. Em uma máquina em UTC, testes quebram sem que exista bug. O mesmo vale para a API: as datas das respostas HTTP dependem do TZ do processo. Suba a API e rode a suíte sempre com `TZ=America/Sao_Paulo`, como nos comandos acima, ou fixe o TZ nos seus scripts.
- O `package.json` não define scripts. Os comandos são via `npx`, como acima.
- O repositório versiona um `yarn.lock`, mas todo o fluxo deste desafio usa npm. Ao rodar `npm install`, um `package-lock.json` será criado e o próprio `yarn.lock` será reescrito (o npm moderno sincroniza lockfiles de outros gerenciadores, trocando centenas de URLs de registry). Isso é esperado: siga com npm e versione o `package-lock.json`; para o `yarn.lock`, tanto faz manter a reescrita quanto restaurá-lo com `git checkout yarn.lock`.
- Não existe tratamento de erros HTTP: uma exceção lançada dentro de um caso de uso derruba o processo Node inteiro (verificado enviando um `type` inválido ao endpoint). Esse comportamento é do projeto base e não deve ser "consertado" neste desafio; a semântica de erros aqui é verificada por testes, não por status HTTP.

## O que já existe (e você vai estender)

Antes de codar, mapeie o terreno. O projeto é TypeScript com Express, pg-promise e Jest. Pontos que você vai tocar ou usar como molde:

- Domínio: `src/domain/Contract.ts` (agregado com `addPayment`, `getPayments`, `getBalance` e `generateInvoices`), `src/domain/Payment.ts`, `src/domain/Invoice.ts`.
- Strategy + Dynamic Factory de referência: `src/domain/InvoiceGenerationStrategy.ts`, `CashBasisStrategy.ts` (usa os payments do contrato), `AccrualBasisStrategy.ts` (usa só os dados do próprio contrato, nunca os payments) e `InvoiceGenerationFactory.ts` (cria a strategy a partir de uma string e lança `Invalid type` para valores desconhecidos). Essa factory é o molde da sua factory de presenters.
- Caso de uso: `src/application/usecase/GenerateInvoices.ts`, com Input e Output tipados (DTO). Repare em três coisas: o Input já tem um campo `format?: string` que nunca é usado para nada; o arquivo importa `ContractDatabaseRepository` de infra sem usar; e os defaults do construtor instanciam `JsonPresenter` e `Mediator` direto de infra. Essas três pontas soltas são suas.
- Portas e adapters: `src/application/repository/ContractRepository.ts` (hoje só `list()`), `src/infra/repository/ContractDatabaseRepository.ts` (o molde do seu repositório de faturas), `src/infra/database/DatabaseConnection.ts` (só `query` e `close`, nenhuma transação) e `PgPromiseAdapter.ts`.
- Decorator de referência: `src/application/decorator/LoggerDecorator.ts`, que envelopa um Usecase sem modificá-lo.
- Presenter: `src/application/presenter/Presenter.ts` (port hoje acoplado ao Output de GenerateInvoices), `src/infra/presenter/JsonPresenter.ts` e `CsvPresenter.ts` (formato `YYYY-MM-DD;amount` por linha, já coberto por teste).
- HTTP: `src/infra/http/HttpServer.ts` e `ExpressAdapter.ts`. Atenção: o adapter repassa ao callback apenas `req.params`, `req.body` e `req.headers`. A query string não chega aos controllers; expor isso é parte do desafio da consulta.
- Mediator e evento: `src/infra/mediator/Mediator.ts` (classe concreta em infra), com o `main.ts` registrando o `SendEmail` (um stub que faz `console.log`) no evento `InvoicesGenerated`.
- Composition Root: `src/main.ts`, onde tudo é montado, incluindo o `LoggerDecorator` em volta do caso de uso.
- Banco e seed: `create.sql` cria o schema `branas` com as tabelas `contract` e `payment` e insere um contrato de 6000 em 12 períodos a partir de 2022-01-01, com um pagamento de 6000 em 2022-01-05. Com esse seed, o regime cash de 01/2022 gera 1 fatura de 6000 e o accrual de 01/2022 gera 1 fatura de 500.
- Testes existentes: `test/Contract.test.ts` (unidade), `test/GenerateInvoices.test.ts` (integração com o banco real) e `test/api.test.ts` (ponta a ponta, exige a API de pé).

## Tecnologias obrigatórias

- Node.js LTS recente com TypeScript, mantendo a stack do projeto (Express, pg-promise, Jest). Não troque de framework HTTP, de biblioteca de acesso a dados nem de banco.
- PostgreSQL (local ou em container, a escolha é sua; o desafio não exige Docker).
- É proibido adicionar ORM, query builder ou biblioteca de transação: a atomicidade deve ser construída sobre o pg-promise através das suas próprias portas e adapters.
- Não adicione dependências de runtime ao `package.json`; o que o projeto traz basta para todos os requisitos. Scripts npm podem ser adicionados à vontade.

## A feature: fechamento do faturamento

### Comportamento esperado

1. Um operador solicita o fechamento de um período informando mês, ano e regime (`cash` ou `accrual`).
2. O sistema carrega os contratos, gera as faturas do período pelo regime informado e as persiste na tabela `branas.invoice`, tudo dentro de uma única transação.
3. Se já existia um fechamento daquele período e regime, ele é substituído por inteiro na mesma transação: as faturas antigas do período/regime saem, as novas entram, e em nenhuma hipótese o período fica duplicado ou pela metade.
4. Ao final, o resumo do fechamento é publicado no evento `InvoicesClosed` via Mediator, e o listener SendEmail o imprime no console.
5. A resposta HTTP do fechamento é a lista das faturas persistidas, no formato pedido pelo campo `format` (JSON por padrão, CSV se solicitado).
6. As faturas fechadas de um período podem ser consultadas em `GET /invoices`, também com `format` opcional.

### Decisões de produto (fechadas, não interprete diferente)

- Reprocessar um fechamento não é erro: é substituição atômica. Não existe estado "período já fechado" nem trava de reprocessamento.
- O endpoint `POST /generate_invoices` continua existindo como está, no papel de simulação: ele não persiste nada. A única mudança permitida nele é passar a respeitar o `format`.
- O resumo do fechamento viaja no evento `InvoicesClosed`, não na resposta HTTP. A resposta HTTP é a lista de faturas.
- A resposta do fechamento é o próprio lote gerado e persistido naquela execução, não uma releitura do banco. Quem relê o banco é o `GET /invoices`.
- A escala das strategies não muda: os valores gerados seguem exatamente a lógica atual de `CashBasisStrategy` e `AccrualBasisStrategy`. Você não corrige nem altera regra de cálculo.

## Regras de negócio e semântica de erros

- Fechar um período com regime válido: persiste as faturas geradas e responde a lista delas. Se o período não gera nenhuma fatura, o fechamento persiste zero faturas (removendo as antigas daquele período/regime, se existirem) e responde uma lista vazia, sem erro.
- Regime (`type`) desconhecido: `Error` com a mensagem `Invalid type`, a mesma já lançada por `InvoiceGenerationFactory`. Não crie uma variação nova da mensagem.
- Formato (`format`) desconhecido: `Error` com a mensagem `Invalid format`, lançada pela sua factory de presenters. Ausência de `format` significa JSON. No fechamento, um `format` inválido falha antes de qualquer efeito: nada é removido nem persistido.
- Falha no meio da persistência do lote: nenhuma fatura do fechamento fica gravada e as faturas do fechamento anterior daquele período/regime permanecem intactas (rollback total).
- Consulta de um período sem faturas: lista vazia `[]`, sem erro.
- As mensagens de erro acima são contratos verificados por teste. No nível HTTP, o comportamento diante de erro permanece o do projeto base (sem tratamento); o roteiro de validação só usa entradas válidas.

## Requisitos

Cada requisito abaixo está amarrado a conceitos do curso. Respeitar o conceito é parte do requisito, não só fazer funcionar.

### 1. Caso de uso de fechamento e persistência das faturas

**Conceitos do curso:** DTO, Repository, Controller, Composition Root, SRP, Domain Model (as strategies de geração continuam sendo a regra de negócio; o fechamento orquestra).

- Crie o caso de uso de fechamento (ex.: `CloseInvoicing`) em `src/application/usecase/`, implementando a interface `Usecase`, com Input `{ month, year, type, format? }` e Output no mesmo DTO `{ date, amount }` já usado por GenerateInvoices. O caso de uso reaproveita `contract.generateInvoices(month, year, type)`; a regra de cálculo não é duplicada nem alterada.
- Crie a porta de repositório de faturas (ex.: `InvoiceRepository`) em `src/application/repository/`, com a implementação de banco em `src/infra/repository/`, seguindo o padrão do repositório de contratos.
- Adicione ao `create.sql` a extensão e a tabela nova, e torne o script reexecutável. O DDL da tabela é fixo:

```
create extension if not exists "uuid-ossp";

create table branas.invoice (
	id_invoice uuid not null default uuid_generate_v4() primary key,
	id_contract uuid not null references branas.contract (id_contract),
	month integer not null,
	year integer not null,
	type text not null,
	date timestamp not null,
	amount numeric not null
);
```

- O `create.sql` atualizado deve executar sem nenhum erro em um banco virgem: `psql -v ON_ERROR_STOP=1 -d app -f create.sql` precisa terminar com sucesso tanto na primeira execução quanto nas seguintes (use `drop schema if exists`). A criação da extensão exige um usuário com privilégio de superusuário; o `postgres` de uma instalação local ou do container oficial já o tem, mas um Postgres gerenciado sem superusuário não serve para este desafio.
- Cada fatura é persistida com o `id_contract` do contrato que a gerou. O `Invoice` de domínio não carrega esse vínculo e permanece como está: o pareamento fatura-contrato acontece no caso de uso, que já gera as faturas contrato a contrato, e viaja até a porta de faturas na estrutura que você definir (ex.: `{ idContract, date, amount }`).
- Exponha o fechamento em `POST /close_invoicing`, registrando a rota em um controller no padrão do `MainController` e montando tudo no `main.ts` (Composition Root), incluindo o `LoggerDecorator` em volta do novo caso de uso, como já é feito com o existente. A obrigação do decorator vale para o fechamento; decorar ou não os demais casos de uso novos é decisão sua.

### 2. Unit of Work: a escrita atômica

**Conceitos do curso:** Unit of Work, Atomicidade, DIP (a porta na aplicação, o mecanismo na infraestrutura), Adapter.

- Estenda a porta `DatabaseConnection` com uma operação de trabalho transacional (ex.: `transaction(work)`), e implemente no `PgPromiseAdapter` usando o suporte nativo de transações do pg-promise. Essa porta vive em `src/infra` e é assunto de infraestrutura: quem a usa é a implementação de banco do repositório de faturas, nunca um caso de uso. A camada de aplicação não conhece a `DatabaseConnection` nem o pg-promise.
- A porta de repositório de faturas expõe uma operação de substituição atômica do período (ex.: `replacePeriod(month, year, type, invoices)`), e a implementação de banco a executa inteira dentro de uma única transação: a remoção das faturas antigas do período/regime e a inserção das novas. Commit no fim; qualquer falha no meio desfaz tudo.
- A pegadinha central: reprocessamento substitutivo sem transação parece funcionar no caminho feliz. O critério que separa Unit of Work de "um monte de inserts" é o comportamento sob falha, e é exatamente isso que o teste do requisito 6 prova.

### 3. Presenter dinâmico com Dynamic Factory

**Conceitos do curso:** Presenter, Dynamic Factory, OCP, LSP (presenters intercambiáveis pela mesma porta), DIP.

- Generalize a porta `Presenter` para servir a qualquer caso de uso (hoje ela está acoplada ao Output de GenerateInvoices). `JsonPresenter` e `CsvPresenter` continuam funcionando como estão.
- Crie a porta de factory de presenters (ex.: `PresenterFactory`) em `src/application/`, com a implementação em `src/infra/` no molde da `InvoiceGenerationFactory`: `"json"` ou ausência de `format` devolve o `JsonPresenter`; `"csv"` devolve o `CsvPresenter`; qualquer outro valor lança `Invalid format`. Adicionar um formato novo no futuro não pode exigir modificação nos casos de uso (OCP).
- Os três pontos de saída usam a factory a partir do `format` do Input: `POST /generate_invoices` (o campo morto finalmente vivo), `POST /close_invoicing` e `GET /invoices`. Em CSV, a resposta segue o formato já estabelecido pelo `CsvPresenter`: uma linha `YYYY-MM-DD;amount` por fatura.
- No `GenerateInvoices`, o parâmetro de presenter injetado no construtor dá lugar à factory. Isso muda a assinatura de construção usada nos testes existentes; a regra de regressão do requisito 6 diz exatamente o que pode ser adaptado.

### 4. Consulta das faturas fechadas

**Conceitos do curso:** Adapter (evoluir o contrato do HttpServer sem vazar Express), Controller, Presenter, Repository.

- O `HttpServer` atual não repassa a query string aos callbacks (o `ExpressAdapter` entrega apenas params, body e headers). Evolua o contrato da porta e o adapter para expor também a query string, sem que Express vaze para fora da infra. Como o callback da porta é tipado apenas como `Function`, o contrato aqui é a ordem e o significado dos argumentos (ex.: a query string como quarto argumento); registre a convenção que adotar.
- Evolua também a resposta do adapter: hoje ele serializa tudo com `res.json`, o que envelopa uma string em aspas e tornaria o contrato CSV deste enunciado inatingível. Quando o output do callback for uma string (caso do CSV), o adapter responde texto puro; quando for objeto ou array, mantém a serialização JSON atual. O comportamento das respostas JSON existentes não muda.
- Exponha `GET /invoices` recebendo `month`, `year`, `type` e `format` opcional pela query string, devolvendo as faturas persistidas daquele período/regime no DTO `{ date, amount }`, ordenadas por `date` crescente, através do presenter resolvido pela factory. Período sem faturas responde lista vazia.
- A consulta lê da tabela `branas.invoice` via porta de repositório de faturas; nenhum SQL em controller ou caso de uso.

### 5. Higiene de dependências (DIP na prática)

**Conceitos do curso:** DIP com Uncle Bob e com Rodrigo Branas, Mediator.

- O código final do curso viola a regra que ele mesmo ensina: `src/application/usecase/GenerateInvoices.ts` importa três coisas de `src/infra` (o `ContractDatabaseRepository`, que nem é usado; o `JsonPresenter` e o `Mediator` como defaults de construtor). Elimine as três.
- Extraia a abstração do Mediator para a camada de aplicação (ex.: uma interface com `publish`, em `src/application/`), mantendo a implementação concreta em `src/infra/mediator/`. Os casos de uso dependem da abstração; o `main.ts` injeta a implementação.
- Regra objetiva ao final: nenhum arquivo de `src/application` ou `src/domain` importa de `src/infra`. Verificável com `grep -rEn "from ['\"][^'\"]*infra" src/application src/domain`, que deve voltar vazio. O alvo são os imports; a palavra "infra" em comentários ou nomes como "infraestrutura" não conta.
- Publique o evento `InvoicesClosed` ao final do fechamento, com o resumo `{ month, year, type, invoices, total }` (quantidade de faturas persistidas e soma dos valores). Registre o `SendEmail` como listener desse evento no `main.ts`, como já é feito para `InvoicesGenerated`. O efeito observável é o resumo impresso no console da API a cada fechamento.

### 6. Testes

**Conceitos do curso:** pirâmide de testes, testes como prova dos padrões (atomicidade, substituição, formato), regressão.

Testes novos obrigatórios, no padrão dos existentes:

- Atomicidade: um teste que force uma falha no meio da persistência do lote de um fechamento (o mecanismo é seu: um dado que viole constraint, um test double da connection que falha na enésima query, o que preferir) e comprove que nenhuma fatura daquele fechamento ficou no banco e que as faturas do fechamento anterior do período/regime permanecem intactas.
- Reprocessamento: fechar duas vezes o mesmo período/regime resulta na mesma quantidade de faturas, sem duplicação.
- Presenter e formato: a factory devolve o presenter certo para `json`, ausência de format e `csv`, e lança `Invalid format` para valores desconhecidos; o fechamento com `format: "csv"` responde no formato `YYYY-MM-DD;amount`.
- Fechamento de ponta a ponta: com o seed do `create.sql`, fechar `accrual` 01/2022 persiste 1 fatura de 500 em 2022-01-01, consultável em seguida.

**Regra de regressão:** os três arquivos de teste do professor permanecem na suíte com todos os seus casos de teste e asserts intactos, e todos passando. A única alteração permitida neles é a montagem (instanciação e wiring em `beforeEach` ou no corpo do teste) para acompanhar as novas assinaturas de construção; nenhum `expect` muda, nenhum teste é removido ou pulado. O diff dos arquivos de teste originais denuncia qualquer coisa além disso.

## Restrições (não negociáveis)

Estas restrições são o que torna isto um desafio de arquitetura. Quebrar qualquer uma delas descaracteriza a entrega.

- `src/domain` e `src/application` não importam nada de `src/infra`. Dependências apontam para abstrações.
- A atomicidade vem de uma transação de banco através da porta de conexão, não de lógica compensatória (nada de "deleta de novo se der erro").
- A regra de cálculo das faturas permanece nas strategies existentes; o fechamento não duplica nem reimplementa cálculo.
- Os padrões e a organização do projeto base são mantidos: você está somando capacidades ao projeto do professor, não o reescrevendo. Entregas que trocam a arquitetura, o framework HTTP, a lib de banco ou o banco não serão aceitas.
- O endpoint `POST /generate_invoices` continua existindo e não passa a persistir nada.
- Se encontrar uma limitação real do projeto base que trave algum requisito, documente no README a limitação e a decisão tomada, em vez de reescrever o mecanismo do professor.

## Fora de escopo

Para manter o foco, não faz parte deste desafio:

- Tratamento de erros HTTP (status codes, handler global). O comportamento do projeto base diante de exceção permanece como está.
- Autenticação, autorização ou qualquer noção de usuário.
- Concorrência entre fechamentos simultâneos do mesmo período. Um fechamento por vez é a premissa.
- Cancelamento ou edição de faturas individuais; a granularidade é sempre o período/regime inteiro.
- Validação de faixas de mês e ano além do que as mensagens de erro definidas cobrem.
- Envio real de e-mail: o `SendEmail` permanece o stub de console do projeto base, apenas passa a escutar também o evento novo.
- Corrigir a dependência de timezone dos testes do professor; apenas configure o ambiente (TZ) para a suíte rodar.
- Otimizar o carregamento dos payments no `ContractDatabaseRepository`: o N+1 existente permanece como está.
- Migrações versionadas, ORM ou Docker. O `create.sql` atualizado é o mecanismo de schema.

## Contratos sugeridos

Os exemplos seguem as convenções do projeto e o seed do `create.sql`. Nomes de classes são sugestões; rotas, campos, tabela e mensagens de erro são fixos. As respostas CSV são texto puro, sem aspas (ver a evolução do adapter no requisito 4).

**Fechar um período (JSON, padrão):**

```
POST /close_invoicing
{ "month": 1, "year": 2022, "type": "accrual" }

200 OK
[ { "date": "2022-01-01T13:00:00.000Z", "amount": 500 } ]
```

**Fechar um período (CSV):**

```
POST /close_invoicing
{ "month": 1, "year": 2022, "type": "cash", "format": "csv" }

200 OK
2022-01-05;6000
```

**Consultar um período fechado:**

```
GET /invoices?month=1&year=2022&type=accrual

200 OK
[ { "date": "2022-01-01T13:00:00.000Z", "amount": 500 } ]
```

**Resumo publicado no evento (impresso no console pelo SendEmail):**

```
{ month: 1, year: 2022, type: 'accrual', invoices: 1, total: 500 }
```

As datas dos exemplos assumem TZ America/Sao_Paulo, como toda a suíte do projeto.

## Critérios de Aceite

Todos obrigatórios.

**Fechamento e Unit of Work**

- ☐ `POST /close_invoicing` persiste em `branas.invoice` as faturas do período/regime e responde a lista delas
- ☐ A tabela `branas.invoice` segue o DDL fixado e `psql -v ON_ERROR_STOP=1 -d app -f create.sql` executa sem erro em banco virgem e em reexecução
- ☐ A porta `DatabaseConnection` foi estendida com a operação transacional e o `PgPromiseAdapter` a implementa; pg-promise não aparece fora de `src/infra`
- ☐ Remoção das faturas antigas e inserção das novas acontecem em uma única transação
- ☐ Fechar duas vezes o mesmo período/regime não duplica faturas
- ☐ Existe teste que força falha no meio do lote e comprova rollback total, com o fechamento anterior do período intacto

**Presenter e formato**

- ☐ A porta `Presenter` está generalizada e `JsonPresenter` e `CsvPresenter` a implementam sem alteração de comportamento
- ☐ A factory de presenters resolve json (default), csv, e lança `Invalid format` para o resto, no molde da `InvoiceGenerationFactory`
- ☐ `format` funciona nos três endpoints; CSV segue `YYYY-MM-DD;amount`
- ☐ `POST /generate_invoices` com `format: "csv"` responde CSV (o campo deixou de ser ignorado) e continua sem persistir nada

**Consulta**

- ☐ O contrato do `HttpServer` e o `ExpressAdapter` expõem a query string sem vazar Express para fora da infra
- ☐ `GET /invoices?month&year&type` devolve as faturas persistidas do período via repositório e presenter; período vazio responde `[]`

**Dependências e evento**

- ☐ `grep -rEn "from ['\"][^'\"]*infra" src/application src/domain` volta vazio (nenhum import de infra; comentários não contam)
- ☐ A abstração do Mediator vive em `src/application` e os casos de uso dependem dela; a implementação segue em `src/infra`
- ☐ O evento `InvoicesClosed` é publicado com `{ month, year, type, invoices, total }` e o SendEmail, registrado no `main.ts`, o imprime a cada fechamento

**Testes e regressão**

- ☐ Todos os testes novos obrigatórios do requisito 6 existem e passam
- ☐ Os três arquivos de teste do professor mantêm seus casos e asserts intactos (apenas montagem adaptada, conforme a regra de regressão) e passam
- ☐ `TZ=America/Sao_Paulo npx jest` executa a suíte inteira verde

## Roteiro de validação manual (fluxo do avaliador)

A partir de um clone limpo do fork, com PostgreSQL de pé:

**1.** `psql -U postgres -c "drop database if exists app;"`, depois `psql -U postgres -c "create database app;"` (os dois comandos separados: DROP e CREATE DATABASE não podem ir na mesma string do psql), e por fim `psql -U postgres -d app -v ON_ERROR_STOP=1 -f create.sql`. O script precisa terminar sem erro (extensão incluída nele). Rodar o `create.sql` de novo também precisa terminar sem erro.

**2.** `npm install` e `TZ=America/Sao_Paulo npx ts-node src/main.ts`. A API sobe na porta 3000.

**3.** `curl -s -X POST http://localhost:3000/close_invoicing -H 'Content-Type: application/json' -d '{"month":1,"year":2022,"type":"accrual"}'`. Resposta: `[{"date":"2022-01-01T13:00:00.000Z","amount":500}]`. No terminal da API, o resumo `{ month: 1, year: 2022, type: 'accrual', invoices: 1, total: 500 }` aparece impresso pelo SendEmail.

**4.** `curl -s "http://localhost:3000/invoices?month=1&year=2022&type=accrual"`. Mesma fatura da resposta anterior.

**5.** Repetir o passo 3. Depois repetir o passo 4: continua exatamente 1 fatura (reprocessamento substituiu, não duplicou).

**6.** `curl -s -X POST http://localhost:3000/close_invoicing -H 'Content-Type: application/json' -d '{"month":1,"year":2022,"type":"cash","format":"csv"}'`. Resposta: `2022-01-05;6000`.

**7.** `curl -s "http://localhost:3000/invoices?month=1&year=2022&type=cash&format=csv"`. Resposta: `2022-01-05;6000`. E `curl -s "http://localhost:3000/invoices?month=3&year=2023&type=cash"` responde `[]`.

**8.** `curl -s -X POST http://localhost:3000/generate_invoices -H 'Content-Type: application/json' -d '{"month":1,"year":2022,"type":"accrual","format":"csv"}'`. Resposta: `2022-01-01;500`. Em seguida, repetir o GET do passo 4: continua exatamente 1 fatura, provando que a simulação não persistiu nada.

**9.** `grep -rEn "from ['\"][^'\"]*infra" src/application src/domain` volta vazio.

**10.** `TZ=America/Sao_Paulo npx jest` com a API ainda de pé (o teste de API do professor exige). Suíte inteira verde, incluindo os testes de atomicidade, reprocessamento e formato.

Síntese: um único `POST /close_invoicing` precisa causar, ao mesmo tempo, a persistência atômica do período, a resposta no formato pedido e o resumo no console via evento; se qualquer um desses efeitos faltar, ou se fechar duas vezes duplicar faturas, a entrega está incompleta.

## Estrutura do entregável

```
.
├── create.sql                    (atualizado: extensão, if exists, tabela invoice)
├── package.json                  (pode ganhar scripts; dependências mantidas)
├── src/
│   ├── domain/                   (permanece como está; sem imports de infra)
│   ├── application/
│   │   ├── usecase/              (você adiciona o fechamento e a consulta)
│   │   ├── repository/           (você adiciona a porta de invoices)
│   │   ├── presenter/            (porta generalizada + porta da factory)
│   │   ├── decorator/            (LoggerDecorator permanece aqui)
│   │   └── ...                   (abstração do Mediator)
│   ├── infra/                    (adapters novos: repositório de invoices, factory de presenters, transação no PgPromiseAdapter, query string e resposta de texto no ExpressAdapter)
│   └── main.ts                   (Composition Root atualizado)
├── test/                         (testes do professor com asserts intactos + seus testes novos)
└── README.md                     (você cria; o repositório base não tem um)
```

Arquivos e pastas adicionais são bem-vindos desde que sigam a organização por camadas do projeto.

## Entregável e regras de entrega

- Link do repositório público no GitHub, fork do repositório base, com a entrega consolidada na branch main.
- README com: instruções verificadas de subida do banco e da API, como rodar a suíte (incluindo o TZ), e um parágrafo curto descrevendo onde vive a transação do fechamento e como você provou a atomicidade no teste de falha.
- Repositório único, base obrigatória: entregas que reescrevem a arquitetura ou ignoram as restrições não serão aceitas.

## Ordem de execução sugerida

**1.** Suba o projeto base do zero (banco, extensão, seed, API, suíte com TZ). Bata nos endpoints e leia o `main.ts` até o grafo de dependências fazer sentido.

**2.** Higiene primeiro: elimine os imports de infra na aplicação, extraia a abstração do Mediator e adapte a montagem dos testes existentes. Suíte verde de novo antes de qualquer feature.

**3.** Generalize a porta `Presenter` e construa a factory de presenters, ligando o `format` nos pontos de saída existentes.

**4.** Estenda a `DatabaseConnection` com a transação e prove-a num teste pequeno antes de usá-la no fechamento.

**5.** Implemente o fechamento: tabela no `create.sql`, porta e repositório de invoices, caso de uso, rota, evento `InvoicesClosed` e o wiring no `main.ts`.

**6.** Evolua o `HttpServer` para a query string e a resposta de texto puro, e entregue o `GET /invoices`.

**7.** Escreva os testes obrigatórios do requisito 6 e rode a suíte completa com a API de pé.

**8.** Percorra o roteiro do avaliador do zero, num clone limpo, seguindo só o seu README. Depois confira a checklist de critérios item a item antes do push final.

## Dicas finais

O primeiro tropeço clássico é o timezone: se a suíte quebrar em datas antes de você ter mexido em qualquer coisa, o problema é o TZ da sua máquina, não o seu código. Resolva isso no minuto um e siga em frente.

O segundo é a fronteira da transação. Uma transação por fechamento, aberta no lugar certo, envolvendo a remoção e todas as inserções. Se cada insert abre a própria transação, o caminho feliz funciona igual e o teste de falha no meio do lote te entrega: é ele que separa Unit of Work de uma sequência de queries.

O terceiro aparece na higiene de dependências: remover os defaults de infra do construtor de `GenerateInvoices` quebra a compilação dos testes do professor, e a correção certa está na montagem dos testes e no `main.ts`, nunca nos asserts. Se um teste antigo começar a falhar depois desse passo, o problema é wiring, não regra de negócio. E o raio-x de todo o resto é o próprio banco: um `select count(*) from branas.invoice where month = 1 and year = 2022` antes e depois de cada operação denuncia em segundos se o fechamento persistiu, substituiu ou duplicou. Um último aviso de bancada: se recriar o schema rodando o `create.sql` com a API no ar, reinicie a API antes de continuar, porque um pool de conexões aberto antes do reseed pode ficar errático e pendurar requisições sem mensagem de erro.

No fim, o desafio cabe numa frase: transformar um cálculo descartável num fechamento confiável, provando com testes que cada padrão do curso está fazendo o trabalho que a aula prometeu.

## Repositórios de Referência

- https://github.com/AlenKaleb/mba_fullcycle_design_patterns
- https://github.com/sibelly/mba_fullcycle_design_patterns
