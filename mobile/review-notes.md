# Notas para revisão de loja

Lumina é uma rede social autenticada. A conta de revisão deve ser criada no ambiente de produção com conteúdo de demonstração não pessoal e sem 2FA obrigatório.

## Percurso recomendado

1. Entrar com a conta de revisão fornecida no formulário privado da loja.
2. `Feed` mostra publicações das pessoas seguidas e permite criar/editar/apagar conteúdo.
3. `Salas` permite espaços públicos ou privados; funcionalidades Ultra permanecem desligadas enquanto pagamentos não estiverem ativos.
4. `Radar` mantém descoberta editorial separada do Feed social e identifica a fonte.
5. `Conversas` oferece mensagens e chamadas entre pessoas ligadas.
6. `Alertas` contém atividade, pedidos de follow e gestão de privacidade.
7. `Perfil` contém bloqueios, denúncia, termos, privacidade, exportação e eliminação de conta.

## Segurança de UGC

- idade mínima de registo: 16 anos;
- conteúdo ilegal, ameaças, assédio, exploração sexual de menores, doxxing, spam e fraude são proibidos nos Termos;
- qualquer pessoa pode denunciar uma conta, publicação ou comentário;
- conteúdo com denúncias suficientes é ocultado automaticamente até revisão;
- a equipa tem fila global para manter/remover conteúdo e suspender contas;
- o autor pode apagar o seu conteúdo e o autor de um post pode remover comentários no próprio post;
- qualquer pessoa pode bloquear outra, cortando relação, visibilidade, Chat e chamadas;
- contacto de segurança e privacidade publicado: `carlos.fernandes@digibox.pt`.

## Permissões

A aplicação não pede permissões sensíveis no arranque. Câmara, microfone, media, notificações, localização e biometria só são pedidos depois de uma ação explícita e têm uma finalidade visível no ecrã.

## Eliminação

O pedido existe em `Perfil` → `Conta & segurança` → `Pedir eliminação da conta`. A execução ocorre após 30 dias e pode ser cancelada durante a janela. Também existe `https://lumina-snowy-ten.vercel.app/eliminar-conta.html`, que permite iniciar o percurso pela Web ou contactar diretamente o responsável sem reinstalar a app.
