# Manual do utilizador

> Como usar o Euroly no dia-a-dia. Esta é a única página de documentação em português — as restantes são técnicas e estão em inglês. Para tópicos avançados, ver [`docs/`](README.md).

## O que é o Euroly

O Euroly é uma aplicação local de gestão financeira mensal. Importas os extratos dos teus bancos, ele categoriza automaticamente os movimentos, mostra-te um dashboard com gráficos e ajuda-te a acompanhar a evolução de empréstimos. Tudo corre no teu computador — nada vai para a internet, ninguém vê os teus dados além de ti.

## Arrancar a aplicação

Faz duplo-clique em `start.bat` na pasta do projeto. Vão abrir duas janelas de terminal ("Euroly API" e "Euroly UI") — deixa-as abertas enquanto usas a app. O browser abre automaticamente em [http://localhost:5173](http://localhost:5173).

Para fechar a app: fecha as duas janelas de terminal.

## Primeira utilização (5 minutos)

Da primeira vez precisas de configurar três coisas antes de poderes importar movimentos: contas, créditos (se tiveres) e regras de categorização. Tudo isto é feito no separador **Backoffice**.

### 1. Criar as tuas contas

Vai a **Backoffice → Contas**.

Para cada conta bancária, cartão ou e-money que tens, clica em "Adicionar" e preenche:

- **Nome** — como queres ver a conta listada (ex: "Conta Principal", "Cartão", "Carteira E-money").
- **Tipo** — À ordem / Poupança / Cartão / E-money.
- **Saldo inicial** — o saldo que a conta tinha ANTES das transações que vais importar. Se vais importar tudo desde o início, mete 0. Se só vais importar a partir de Janeiro de 2026, mete o saldo a 31 de Dezembro de 2025.
- **Cor** — usada nos cartões e gráficos.
- **Ativa** — desativa contas antigas que já não usas mas queres manter no histórico.

Repete para cada conta. Os nomes ficam apenas no teu computador — não são enviados para lado nenhum nem aparecem no código.

### 2. Criar os teus créditos (se aplicável)

Salta este passo se não tens empréstimos ativos.

Vai a **Backoffice → Créditos** e adiciona cada empréstimo:

- **Nome do crédito** — como o queres identificar (ex: "Sofá", "Carro", "Crédito Pessoal").
- **Credor** — quem dá o crédito (ex: "Banco X", "Financeira Y").
- **Total a pagar** — montante total que vais pagar do princípio ao fim (capital + juros).
- **Prestação mensal** — quanto sai por mês.
- **Nº prestações** — quantas prestações no total (ex: 36).
- **TAEG %** — opcional, informativo.
- **Início / Fim previsto** — opcionais.

O Euroly não calcula juros nem antecipações por ti — assume prestações fixas. Isto cobre 99% dos casos de crédito ao consumo.

### 3. Criar regras de categorização

Para o Euroly categorizar automaticamente, precisa de saber como reconhecer cada tipo de movimento. As regras fazem isto.

Vai a **Backoffice → Regras**. Para cada padrão recorrente nos teus extratos, cria uma regra:

- **Palavra-chave** — o texto que aparece no descritivo do banco (ex: `EDP`, `CONTINENTE`, `SALARIO`).
- **Tipo** — `contém` para a maioria dos casos.
- **Categoria** — a categoria onde queres pôr.
- **Crédito (opcional)** — se este movimento é o débito direto de um empréstimo, escolhe o crédito aqui. O movimento fica automaticamente ligado ao crédito.
- **Prioridade** — número; menor = corre primeiro. Usa números mais baixos para regras mais específicas.

> 💡 **Dica:** antes de gravar, clica em "Pré-visualizar" para ver quantas transações esta regra apanharia (precisa de já teres importado pelo menos um extrato).

> 💡 **Exemplo prático:** se tens um crédito cujo débito mensal aparece no banco como "DD CREDOR-X 12345678", cria:
>
> - Palavra-chave: `CREDOR-X`
> - Tipo: `contém`
> - Categoria: `Créditos`
> - Crédito: o crédito correspondente
> - Prioridade: `50` (mais específica que regras genéricas)
>
> A partir daí, todas as parcelas com aquele descritivo vão para Créditos e contam automaticamente como pagamentos do crédito.

Não precisas de criar todas as regras à primeira — começa com as principais (ordenado, renda, água, luz, supermercado) e cria as restantes à medida que vais importando.

## Importar movimentos do banco

Vai a **Transações** e clica em **Importar Excel / CSV** (canto superior direito). Escolhe o ficheiro do banco e, na janela que aparece, seleciona a que conta esta importação pertence.

O ficheiro pode estar em formato `.xlsx`, `.xls` ou `.csv`. As colunas são detetadas automaticamente para o formato dos bancos portugueses mais comuns (Data Operação, Descrição, Montante, Saldo Contabilístico).

Depois de importar vês:

- **X novas transações** — quantas foram adicionadas.
- **X duplicadas (ignoradas)** — se importaste o mesmo ficheiro duas vezes, ou se há sobreposição com importações anteriores, essas são detetadas e ignoradas. Não há perigo em reimportar.

As transações importadas correm imediatamente pelas regras de categorização. As que não correspondem a nenhuma regra ficam no separador **Validação**.

## Validar transações pendentes

Vai a **Validação**. Aqui vês todas as transações que ainda não têm categoria.

Para cada uma:

1. Escolhe a categoria correta no dropdown.
2. **Opcional:** marca "Guardar regra" — vai criar automaticamente uma regra que apanha futuras transações com o mesmo descritivo.
3. Clica em "Validar".

Se já preencheste várias, clica em **"Validar selecionadas"** no topo para aplicar tudo de uma vez.

> 💡 A regra criada pela checkbox usa as primeiras 3 palavras do descritivo. Se for muito específica (ex: inclui um número de fatura), vai a Backoffice → Regras e encurta a palavra-chave.

## Ver o Dashboard

Vai a **Dashboard**. Mostra:

- **4 cartões KPI** no topo: Rendimento, Despesas, Poupança, Taxa de Poupança do mês selecionado.
- **Gráfico de barras** com rendimento vs despesa por mês ao longo do ano.
- **Gráfico circular** com a distribuição das despesas por categoria neste mês.
- **Linha** com a evolução da poupança acumulada.

No topo direito tens três dropdowns:

- **Conta** — `Todas as contas` (vista geral) ou uma conta específica.
- **Mês** — qual mês os KPIs e o circular mostram.
- **Ano** — qual ano os gráficos de barras e linha cobrem.

> 💡 **Transferências entre contas** estão **excluídas** das somas. Quando moves dinheiro entre as tuas próprias contas isso não é despesa nem rendimento real — apenas reorganização. Para marcar uma transação como transferência interna, vai à página **Transações** e clica no botão `↔` à direita da linha.

## Ver as Contas

A página **Contas** mostra um cartão por conta com o saldo atual (calculado como saldo inicial + entradas − saídas). Clica em "Ver transações →" num cartão para ver só os movimentos dessa conta.

No topo vês o saldo total agregado, o total dos saldos positivos e dos negativos (útil se tens conta a descoberto ou cartão de crédito a usar).

## Ver os Créditos

A página **Créditos** mostra um cartão por empréstimo com uma barra de progresso. Clica num cartão para expandir e ver:

- Data de início, fim previsto, taxa de juro, último pagamento detetado.
- Lista de todos os pagamentos identificados (movimentos onde a regra ligou aquele crédito).

No topo vês o total contraído, total pago, em falta, e a soma das prestações mensais dos créditos ativos — para saberes quanto sai por mês em prestações.

## Página Transações

Página completa para inspeção e edição manual:

- **Filtros:** pesquisa por texto, conta, crédito, mês, ano, tipo, estado (validada / pendente).
- **Inline edit:** podes mudar a categoria de qualquer transação directamente no dropdown da coluna "Categoria".
- **Botão ↔:** marca uma transação como transferência interna (exclui-a dos totais do dashboard).

## Backup dos teus dados

Toda a tua informação vive num único ficheiro: `backend/euroly.db`. Para fazer backup:

1. Fecha a app (fecha as duas janelas de terminal).
2. Copia `backend/euroly.db` para um sítio seguro (drive externa, cloud, …).

Para restaurar: copia o ficheiro de volta para o mesmo sítio antes de abrir a app.

## Perguntas frequentes

**Posso usar o Euroly para várias pessoas?**
Não. É single-user. Se queres separar despesas com outra pessoa, podes criar contas distintas para cada um e usar filtros no dashboard, mas não há autenticação nem perfis.

**E se o meu banco usar um formato de Excel diferente?**
A deteção de colunas é tolerante e cobre os formatos mais comuns dos bancos portugueses. Se algo falha, abre o Excel, confirma que tem colunas "Data Operação", "Descrição" e "Montante" (ou equivalentes) e tenta de novo. Para suporte a um banco novo, ver [IMPORT.md](IMPORT.md#adding-a-new-bank-format).

**Posso editar uma regra depois de criada?**
A app atual não tem botão de editar regras — só criar, apagar ou pré-visualizar. Para alterar, apaga e cria de novo. (É uma melhoria fácil para o futuro.)

**Eliminei uma categoria por engano. As transações desapareceram?**
Não. Apagar uma categoria só remove a ligação — as transações ficam sem categoria e reaparecem na fila de Validação. Volta a categorizá-las.

**O dashboard mostra valores estranhos depois de eu ter feito uma transferência entre as minhas contas.**
Marca as duas pernas da transferência (a saída numa conta + a entrada na outra) com o botão ↔ na página Transações. O dashboard volta a fazer sentido.

**Não vejo os meus créditos a evoluir.**
Confirma que tens uma regra com o `Crédito` preenchido para esse empréstimo. Sem a regra, os pagamentos são categorizados mas não ligados ao crédito — e a página Créditos não consegue contá-los.

**Mudei o saldo inicial de uma conta e os saldos atuais mudaram nos meses passados também.**
Sim — o saldo atual é sempre `inicial + entradas − saídas` desde o início. Não é uma fotografia histórica; muda imediatamente quando ajustas o saldo inicial.

**Quero reinstalar o Euroly sem perder os dados.**
Copia `backend/euroly.db`, elimina a pasta toda, clona o repositório de novo, e coloca o ficheiro de volta na mesma pasta antes de correr `start.bat`.
