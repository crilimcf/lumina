-- Remove apenas a conta técnica criada para a validação final de produção.
-- A dupla condição impede que outra conta com nome semelhante seja afetada.
DELETE FROM users
 WHERE handle = 'qa.816889351'
   AND email = 'qa.816889351@example.test';
