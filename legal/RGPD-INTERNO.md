# Registo de atividades de tratamento e resposta a incidentes

Dois documentos internos que o RGPD exige e que nunca são publicados: ficam
guardados e mostram-se à CNPD se ela pedir.

> Campos entre `[colchetes]` a preencher.

---

# Parte 1 · Registo de atividades (artigo 30)

**Responsável pelo tratamento:** `[nome legal]`, `[morada]`, NIF `[NIF]`
**Contacto:** `[email]`
**Última atualização:** `[data]`

## A · Contas de utilizador

| | |
|---|---|
| **Finalidade** | Permitir criar conta, entrar e usar o serviço |
| **Categorias de titulares** | Utilizadores registados, todos com 16+ anos |
| **Categorias de dados** | Nome, nome de utilizador, email, password em hash, data de nascimento, data de aceitação dos termos |
| **Fundamento** | Execução do contrato (art. 6.º/1/b); verificação de idade por obrigação legal (art. 6.º/1/c) |
| **Destinatários** | Railway (alojamento), Resend (ainda não configurado) |
| **Transferências fora do EEE** | Sim — Railway aloja atualmente nos EUA. Garantias por indicar; ver `SEGURANCA.md` |
| **Prazo de conservação** | Enquanto durar a conta, mais 30 dias após pedido de apagamento |
| **Medidas de segurança** | bcrypt fator 12, HTTPS, 2FA opcional, bloqueio progressivo |

## B · Conteúdo publicado

| | |
|---|---|
| **Finalidade** | Prestar o serviço: feed, comunidades, convites |
| **Categorias de dados** | Texto, imagens, reações, comentários, votos, adesões, dias respondidos |
| **Fundamento** | Execução do contrato |
| **Destinatários** | Railway (alojamento), Cloudflare R2 (imagens, ainda não configurado) |
| **Prazo** | Enquanto durar a conta |
| **Notas** | Imagens verificadas pela assinatura do ficheiro antes de serem publicáveis |

## C · Mensagens privadas

| | |
|---|---|
| **Finalidade** | Comunicação entre utilizadores |
| **Categorias de dados** | Texto, imagens, metadados (remetente, hora, estado de leitura) |
| **Fundamento** | Execução do contrato |
| **Prazo** | Normais: enquanto durar a conta. Efémeras: conteúdo apagado do servidor quando expira; fica só o registo de que existiram |
| **Notas** | **Sem cifragem ponto a ponto.** Está declarado na política de privacidade |

## D · Segurança e prevenção de abuso

| | |
|---|---|
| **Finalidade** | Travar ataques a contas e permitir gerir sessões |
| **Categorias de dados** | Email, endereço IP, agente do navegador, êxito ou falha, data |
| **Fundamento** | Interesse legítimo (art. 6.º/1/f) — proteger contas contra acesso indevido |
| **Ponderação** | O tratamento é mínimo e diretamente ligado à proteção dos próprios titulares. Sem ele, um ataque por força bruta passaria despercebido |
| **Prazo** | `[90]` dias |

## E · Moderação de conteúdo

| | |
|---|---|
| **Finalidade** | Tratar denúncias e aplicar as regras da comunidade |
| **Categorias de dados** | Denúncias, conteúdo denunciado, decisões e quem as tomou |
| **Fundamento** | Interesse legítimo; obrigação legal quando envolver conteúdo ilegal |
| **Destinatários** | Moderadores da comunidade em causa; autoridades quando a lei obrigar |
| **Prazo** | `[2]` anos, para poder responder a queixas sobre decisões |

## F · Comunicações por email

| | |
|---|---|
| **Finalidade** | Recuperar password e enviar avisos essenciais |
| **Categorias de dados** | Email, token em hash |
| **Fundamento** | Execução do contrato |
| **Destinatário** | `[Resend]` |
| **Prazo** | Tokens expiram em 1 hora; apagados ao fim de 7 dias |

---

# Parte 2 · Resposta a violações de dados

O RGPD dá **72 horas** para notificar a CNPD a contar do momento em que tomas
conhecimento. Sem um plano escrito, essas 72 horas gastam-se a decidir o que
fazer.

## Hora 0 a 1 · Conter

- [ ] Isolar o que está a ser explorado — desligar o serviço se for preciso
- [ ] Trocar segredos: `JWT_SECRET`, credenciais da base de dados, chaves do armazenamento
- [ ] Forçar o fecho de todas as sessões: `UPDATE users SET session_version = session_version + 1`
- [ ] Guardar registos **antes** de reiniciar seja o que for. Um reinício apaga provas.

## Hora 1 a 24 · Perceber

- [ ] Que dados foram atingidos? Contas, conteúdo, mensagens, imagens?
- [ ] Quantas pessoas?
- [ ] Como entraram? Por onde?
- [ ] Ainda está a acontecer?
- [ ] Escrever uma cronologia com horas concretas

## Hora 24 a 72 · Notificar

**À CNPD** — obrigatório salvo se for improvável haver risco para as pessoas.
Formulário em [cnpd.pt](https://www.cnpd.pt). Incluir:
- natureza da violação e categorias de dados
- número aproximado de pessoas afetadas
- consequências prováveis
- medidas tomadas e a tomar
- contacto para mais informação

**Às pessoas** — obrigatório se o risco for elevado. Por email, em linguagem
simples: o que aconteceu, que dados, o que devem fazer (trocar password, ligar
dois passos), e como falar contigo.

Não obrigatório se os dados estivessem cifrados de forma que ninguém os consiga
ler — o que não é o caso do conteúdo da Lumina.

## Depois

- [ ] Corrigir a causa, não o sintoma
- [ ] Registar o incidente no registo interno (obrigatório mesmo que não notifiques)
- [ ] Rever o que falhou na deteção: quanto tempo passou até dares conta?

## Contactos

| | |
|---|---|
| Responsável interno | `[nome, telefone]` |
| CNPD | geral@cnpd.pt · +351 213 928 400 |
| Advogado | `[nome, telefone]` |
| Alojamento (suporte) | `[contacto]` |

## Registo de incidentes

| Data | O que aconteceu | Pessoas afetadas | Notificada CNPD? | Notificados titulares? | Resolução |
|---|---|---|---|---|---|
| | | | | | |
