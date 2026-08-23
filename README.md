# Seletor de banco de dados

Dez perguntas sobre o que você está construindo — nenhuma sobre banco de
dados. Devolve um ranking, por que o vencedor venceu e como cada ponto foi
perdido, quais das suas respostas realmente seguram o resultado, e um ADR
pronto para o repositório.

Zero dependências. Node só para servir os arquivos e rodar os testes.

## Rodar

```bash
npm start     # http://localhost:5173
npm test      # 29 testes: âncoras, invariantes, robustez de pesos, pares adversariais
```

Não abra `src/web/index.html` direto pelo Explorer. O navegador bloqueia
`fetch()` em `file://` e a base de dados não carrega — a tela mostra um aviso
explicando isso.

## Estrutura

```
dados/
  bancos.json         fatos sobre cada banco, com a versão avaliada
  perguntas.json      política: como cada resposta vira exigência
src/motor/
  motor.js            função pura, sem I/O — roda no Node e no navegador
  motor.test.js       casos-âncora, o contrato contra regressão
src/web/
  index.html          interface
  app.js              liga a interface ao motor
scripts/
  servidor.js         estático, sem dependência
```

O mesmo `motor.js` roda nos testes e no navegador. Não existe uma segunda
implementação para manter em sincronia.

## Base teórica: CAP, na versão que decide

O CAP clássico responde uma pergunta só: *com a rede partida entre as cópias,
sacrificar disponibilidade ou consistência?* Partição é evento raro — e a
classificação binária CP/AP esconde que MongoDB, Cassandra e DynamoDB mudam
de lado por configuração de operação.

Por isso o motor usa PACELC (Abadi, 2012): a pergunta do CAP durante a falha
(**PA/PC**, alimentada pela pergunta sobre falha de rede) mais a escolha que
o banco faz o dia inteiro em operação normal — latência ou consistência
(**EL/EC**, alimentada pela pergunta de read-your-writes). Os dois eixos são
contínuos (`p`/`e` em `bancos.json`), as respostas viram um alvo, e a
distância de cada banco até o alvo custa até 25 pontos.

De propósito, PACELC é só uma fatia da nota: o teorema não diz nada sobre
transação, integridade, modelo de consulta nem custo operacional — e é isso
que decide a maioria dos casos reais.

## As decisões que sustentam o resultado

**Fato e política em arquivos separados.** `bancos.json` diz o que cada banco
faz — verificável, com a versão avaliada declarada, porque a resposta certa
para MongoDB muda entre a 3.6 e a 7. `perguntas.json` diz como uma resposta
vira exigência, e isso é opinião. Opinião precisa ser discutível sem mexer no
fato.

**Ninguém ganha ponto.** Todos começam em 100 e só perdem por requisito
declarado e não cumprido. Com bônus, o generalista mediano vence o
especialista por acúmulo — o DynamoDB passava na frente do Elasticsearch numa
busca textual.

**Restrição dura ≠ pontuação baixa.** `bloqueante` tira da lista com motivo em
texto; `grave`/`moderado`/`leve` tiram 30/12/5 pontos. Um banco nunca é
descartado por acumular penalidade. É o que permite responder "por que o Mongo
não apareceu?" com uma frase.

**Candidato derivado precisa se justificar.** TimescaleDB tem todas as
capacidades do Postgres mais séries temporais; num modelo de capacidades, o
superconjunto vence sempre — e venceu um CRUD comum nos testes. `derivaDe` +
`justificaSe` fazem a extensão só entrar quando a necessidade que ela resolve
está declarada. Vale para PostGIS, pgvector, Citus.

**Camada não vence a fonte da verdade.** Redis e Elasticsearch declaram
`fonteVerdade: false`. Quem responde que o dado não dá para reconstruir da
origem (perda de no máximo alguns segundos) os penaliza — sem isso, o
Elasticsearch ganhava o catálogo de produtos do MongoDB: ótimo índice,
péssimo dono do dado. Quando o dado é reprocessável, a penalidade some, e é
por isso que a busca do site continua sendo dele.

## Como mexer

**Adicionar um banco:** uma entrada em `dados/bancos.json`. Declare todas as
capacidades — um teste verifica que nenhuma ficou faltando.

**Discordar de um resultado:** adicione um caso em `motor.test.js` com o
vencedor que você defenderia, e ajuste o peso até passar sem quebrar os
outros. Os casos-âncora são o contrato: se um quebrar depois de você mexer num
peso, o ajuste está errado — não o caso. Dois testes vigiam a saúde desse
contrato: todo banco precisa vencer ou empatar tecnicamente em algum âncora
(banco que nunca chega perto está sobrando, ou falta o âncora dele), e todo
vencedor precisa sobreviver a ±20% em cada peso (âncora que vira com
perturbação pequena está apoiado em coincidência numérica, não em estrutura).
Cenários onde dois bancos são genuinamente defensáveis viram caso adversarial:
o contrato é o par no topo, e a ordem fica para o aviso de empate técnico.

**Mudar uma pergunta:** só `dados/perguntas.json`. Todo requisito precisa de um
`motivo` em texto; sem motivo não há explicação para mostrar ao usuário, e o
teste falha.

## Portar o motor para Java

`avaliar()` não tem I/O nem dependência. Em Spring, vira um `@Service` sem
repositório, com os dois JSON como recurso versionado. Os casos-âncora viram
`@ParameterizedTest` com a mesma tabela.

## Se virar produto

O motor roda no cliente: latência zero, funciona offline, e nenhuma descrição
de arquitetura interna sai da máquina de quem responde — isso é argumento de
venda, não limitação.

Servidor só é necessário para link compartilhável da decisão, distribuição da
base versionada e telemetria. A telemetria é o ativo real: a distribuição das
respostas mostra onde as pessoas se confundem, e as combinações que caem em
"nenhum candidato viável" apontam lacunas na base.

Se entrar uma camada de LLM, ela traduz texto livre em respostas do
questionário e devolve para o usuário confirmar. **Ela nunca escolhe o banco.**
Determinismo e auditabilidade são o que essa ferramenta vende.
