# Lumina — PostgreSQL em produção: segurança, capacidade e recuperação

> Runbook de produção, 10-10-2026. **Não restaurar, apagar, desmontar ou substituir** o volume existente para corrigir espaço. O estado dos backups ainda NÃO foi verificado.

## Inventário confirmado

| Recurso | Valor |
| --- | --- |
| Railway project | `lumina` (`ea3ad6aa-658d-4fb4-9659-8c3edc06cc77`) |
| Ambiente | `production` |
| PostgreSQL | Serviço `Postgres` (`575c6cac-b041-455a-8642-ac43d14b5759`) |
| Volume atual | `postgres-volume-xeP9` (`2b41ef00-103d-489e-ae07-a78f38d22043`) |
| Montagem | `/var/lib/postgresql/data` |
| Região | `europe-west4-drams3a` |
| Capacidade | 500 MB |
| Uso medido pelo Railway | cerca de 319 MB (64%) |
| API | Mesmo datacenter, online; Postgres online |

O indicador Railway assinala um aviso para PostgreSQL mas a integração não expõe a **causa exata**. Não interpretar 64% como diagnóstico provado desse aviso; verificar os detalhes no painel.

## P0: Proteger os dados e aumentar a capacidade

1. No [projeto Railway](https://railway.com/dashboard), selecionar `lumina` > `production` > serviço `Postgres`. Confirmar na aba de volumes que o volume e o mount path são os acima. Verificar *Observability/Health/Issues* para a causa concreta do aviso.
2. Verificar **Backups** do serviço. Confirmar se já existem backups diários/semanais e a data de um ponto válido. Registar essa evidência; não afirmar proteção existente sem confirmação.
3. Usar **Volume settings > Live Resize** e aumentar o volume existente de 500 MB para **no mínimo 1 GB** (preferencialmente 2 GB se permitir margem para crescimento e política de custos). Railway indica que expansão normal é online, sem downtime; confirmar a operação terminada e o espaço novo antes de continuar.
4. Ativar **Backups > Daily** e **Weekly**, se não estiverem ativos; manter pontos mensais conforme exigência de negócio. Depois do resize, iniciar e confirmar um backup manual adicional, se elegível.
5. Não executar um restore contra a produção. Preparar e **ensaiar recuperação para um destino não produtivo** quando o mecanismo/suporte Railway o permitir. A documentação Railway informa que o restore de volume é preparado como alteração para revisão e que o volume anterior fica retido, mas obriga a cautela e a uma janela de manutenção se aplicado em produção.
6. Validar `GET /health` na API, login, Feed, Chat, Radar, Salas e uploads, assim como replicação de métricas Railway e regressão GitHub Actions. Se houver falhas, parar novas alterações e seguir o procedimento de rollback.

**Importante:** Railway documenta que backups **manuais** de volume têm limite de 50% da sua capacidade. Com 500 MB e ~319 MB usados, não contar com um snapshot manual antes do aumento para pelo menos 1 GB. A utilização real por snapshots e a elegibilidade do backup têm de ser verificadas no painel.

Fontes oficiais:
- [Railway — Live Resizing](https://docs.railway.com/volumes#live-resizing-the-volume)
- [Railway — Volume Backups](https://docs.railway.com/volumes/backups)

## P1: Diagnóstico a partir do código

A rota restrita `GET /api/reports/database-health` devolve apenas métricas técnicas agregadas: tamanho lógico da base, conexões e 10 maiores tabelas com estimativas de linhas vivas/mortas. Requer sessão autenticada com `is_staff = true`; não devolve linhas de utilizadores nem segredos e usa `Cache-Control: no-store`.

O tamanho lógico calculado por `pg_database_size` **não equivale ao uso total do volume**: WAL, ficheiros auxiliares e overhead do filesystem não são incluídos. Usar os gráficos de volume Railway como fonte para alertas de espaço livre.

## P2: Política operacional recomendada

- Alerta antecipado de ocupação aos **70%**, escalonamento aos **85%**; aumento de capacidade antes de 90%.
- Vigiar a tendência diária de crescimento (MB/dia) e prever 30 dias de reserva de capacidade.
- Conferir diariamente o último backup bem-sucedido, com ensaio documentado de recuperação periódico.
- Rever tabelas de maior crescimento e consultas lentas. Usar autovacuum normal; não executar `VACUUM FULL`, `TRUNCATE`, exclusões em massa, alterações de `PGDATA` ou migrações em produção sem backup/rollback validado.
- Fazer a distinção entre deploy web, API, binários nativos e migrações PostgreSQL. A compilação do iOS/Android não publica automaticamente nas lojas.

### Critério de encerramento

Só marcar **PostgreSQL pronto** quando houver: causa do aviso identificada e resolvida; volume expandido com nova capacidade visível; backup de produção validado e política automática ativa; ensaio de recuperação seguro; API e aplicação sem regressão; alertas operacionais definidos.
