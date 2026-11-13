# jev-command-guard

Um guardião para o [Claude Code](https://claude.com/claude-code) que usa o **Jev**, o modelo de decisão da [TypeSafe AI](https://docs.typesafe.ai), para avaliar cada comando Bash/PowerShell **antes** de ele rodar. Se o comando parecer perigoso, o Claude Code para e pede sua confirmação, mostrando o motivo.

```
Claude quer rodar:  git reset --hard HEAD~5
                         │
              hook PreToolUse (src/hook.ts)
                         │  1 chamada, ~100 ms
                         ▼
        Jev responde 6 perguntas tipadas em paralelo
   category: git (97%) · risk: 2.2/3 · deletes_data: 0.97 ...
                         │
              política (src/policy.ts)
                         ▼
   ⚠ Confirmação: "Jev: risco 2.2/3 (alto) · apaga/sobrescreve dados (97%)"
```

O projeto existe para **aprender como o Jev funciona** num caso de uso real, que roda dezenas de vezes por dia enquanto você trabalha.

## O que é o Jev, em uma frase

Um modelo que **não gera texto**: você manda um `state` (o dado) e `questions` tipadas, e ele devolve respostas que só podem ser as opções que você definiu, com probabilidades.

| Tipo | Usado aqui para | Retorno |
|---|---|---|
| `choice` | `category`: read_only, build_test, git, package_install, file_change, network, system | opção escolhida + probabilidade de cada uma |
| `score` | `risk`: escala de 0 (inofensivo) a 3 (crítico) | média ponderada, ex.: `2.2` |
| `noul` | `deletes_data`, `sends_data_out`, `touches_secrets`, `runs_remote_code` | probabilidade de "sim", de 0 a 1 |

As perguntas ficam em [src/questions.ts](src/questions.ts). O SDK TypeScript infere os tipos das respostas a partir delas: `answers.category.choice` já vem tipado como `"read_only" | "build_test" | ...`.

## Princípios do guardião

- **Só adiciona atrito, nunca remove.** O hook pode pedir confirmação (`ask`) ou bloquear (`deny`, opcional), mas nunca aprova um comando sozinho. Comandos de baixo risco seguem o fluxo normal de permissões do Claude Code.
- **Falha aberto.** Sem chave, sem rede ou com erro da API, o hook não opina e o Claude Code segue normalmente. O erro vai para o log.
- **O Jev responde, o seu código decide.** Os limites ficam em [guard.config.json](guard.config.json) e a lógica em [src/policy.ts](src/policy.ts).

## Instalação

Requisitos: Node.js 22.18+ (o projeto roda `.ts` direto, sem build) e uma chave da TypeSafe.

```bash
npm install
cp .env.example .env   # e coloque sua TYPESAFE_API_KEY
```

Pegue a chave **só no console oficial da TypeSafe** (veja o [Quick start](https://docs.typesafe.ai/introduction/quickstart)).

Teste um comando na mão:

```bash
npm run try -- "git push --force origin main"
npm run try -- --tool PowerShell "Remove-Item -Recurse -Force C:\temp"
```

A saída mostra tudo que o Jev devolveu: a probabilidade de cada categoria, a distribuição do risco, as flags e a decisão final.

## Ativando o hook

**Só neste projeto (já configurado):** o arquivo [.claude/settings.json](.claude/settings.json) registra o hook. Abra o Claude Code nesta pasta e use normalmente.

**Em todos os projetos:** adicione ao seu `~/.claude/settings.json`, trocando o caminho pelo desta pasta:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [
          { "type": "command", "command": "node \"C:/caminho/para/jev-use-case/src/hook.ts\"", "timeout": 15 }
        ]
      }
    ]
  }
}
```

O `.env` é lido da pasta do projeto, então a chave funciona de qualquer diretório.

## Acompanhando e ajustando

Toda decisão é registrada em `logs/decisions.jsonl` (fora do git).

```bash
npm run report        # decisões, categorias, latência p50/p95, tokens e custo estimado
npm run report -- 20  # + as últimas 20 decisões
```

E para medir a qualidade de forma objetiva:

```bash
npm run eval
```

O eval roda o guardião contra [eval/dataset.json](eval/dataset.json), 35 comandos rotulados à mão como `pass` ou `ask`, e mostra a acurácia, os **falsos negativos** (comando perigoso que passou, o erro grave) e os **falsos positivos** (comando inofensivo que pediu confirmação, o erro chato).

### Exercícios para aprender

1. Rode `npm run eval` e anote a acurácia. Depois mude `askAtRisk` de `1.5` para `1.0` e para `2.0`. Como se movem os falsos positivos e os negativos?
2. Reescreva a `instruction` de `deletes_data` em [src/questions.ts](src/questions.ts) sem os exemplos entre parênteses. A acurácia cai?
3. Adicione uma pergunta nova, por exemplo `noul("command affects files outside cwd")`, use-a na política e veja o tipo de `answers` mudar sozinho no editor.
4. Acrescente ao dataset os comandos reais que aparecerem no `npm run report` e que o guardião errou.
5. Ligue `"denyEnabled": true` e veja o Claude Code receber o bloqueio e tentar outro caminho.

## Configuração (`guard.config.json`)

| Campo | Padrão | Efeito |
|---|---|---|
| `tools` | `["Bash", "PowerShell"]` | ferramentas do Claude Code avaliadas |
| `askAtRisk` | `1.5` | risco (0..3) a partir do qual pede confirmação |
| `flagThreshold` | `0.8` | probabilidade mínima para uma flag sim/não contar |
| `denyEnabled` | `false` | se `true`, risco ≥ `denyAtRisk` ou código remoto é bloqueado |
| `denyAtRisk` | `2.5` | limite de bloqueio |
| `timeoutMs` | `4000` | timeout por tentativa da chamada ao Jev |

## Estrutura

```
src/
  questions.ts   as 6 perguntas para o Jev (o "prompt" do projeto)
  classify.ts    cliente do SDK e a chamada systemOne
  policy.ts      probabilidades -> pass / ask / deny
  guard.ts       núcleo do hook, testável e sem I/O de processo
  hook.ts        entrada do hook: stdin -> stdout
  log.ts         log JSONL
  cli/try.ts     testa um comando e mostra todas as probabilidades
  cli/report.ts  resumo do log
eval/            dataset rotulado + script de avaliação
test/            testes (node:test) com fetch falso, sem rede e sem chave
```

```bash
npm run check   # typecheck + testes
```

## Privacidade

O texto de cada comando avaliado (e a pasta onde ele roda) é enviado para a API da TypeSafe. Se você trabalha com comandos que contêm dados sensíveis, leve isso em conta ou restrinja o hook com `tools` / `matcher`.

## Licença

MIT
