# Politique de confidentialité de Lumina

**Version :** 15 août 2026

## 1. Responsable du traitement

**Responsable :** Carlos Fernandes

**E-mail :** carlos.fernandes@digibox.pt

**Adresse :** Rua da Cabecinha n° 23, 5300-802 Rebordainhos, Bragança, Portugal

**NIF :** 227369661

## 2. Données traitées

Selon les fonctionnalités utilisées, Lumina peut traiter :

- l’identifiant interne du compte ;
- le nom, le nom d’utilisateur, l’e-mail et la date de naissance ;
- la biographie, l’avatar et les centres d’intérêt ajoutés au profil ;
- la configuration du profil public ou privé ;
- les relations de suivi, demandes de suivi et blocages ;
- les publications, commentaires, réactions et republications ;
- les Moments et leurs visualisations ;
- les Salons créés ou rejoints, les invitations et les messages de Salon ;
- les messages privés, les états de lecture/ouverture et les appels ;
- les photos et vidéos envoyées ;
- les signalements et décisions de modération ;
- les données techniques de sécurité, telles que les sessions, le user-agent, l’adresse IP et les tentatives de connexion ;
- les demandes de récupération du mot de passe, la validation en deux étapes et les codes de récupération sous forme protégée ;
- les données nécessaires aux paiements lorsqu’une fonctionnalité payante est effectivement activée.

## 3. Pourquoi nous utilisons les données

Les données sont traitées pour :

- créer et protéger le compte ;
- afficher le Fil, les profils et les connexions sociales ;
- gérer les profils privés et les demandes de suivi ;
- permettre les Salons, les Messages, les appels, les Moments et Radar ;
- stocker et distribuer les médias ;
- prévenir les abus, le spam et les accès non autorisés ;
- modérer le contenu signalé ;
- exécuter les demandes d’exportation, de correction et de suppression ;
- exploiter, diagnostiquer et améliorer le service.

Les bases juridiques applicables sont l’exécution des Conditions et du service demandé, le respect des obligations légales, les intérêts légitimes liés à la sécurité, à la prévention des abus et à l’amélioration du service, ainsi que le consentement lorsqu’il est expressément demandé. Le consentement peut être retiré à tout moment sans affecter les traitements déjà effectués.

## 4. Visibilité

- Un profil public peut être consulté par d’autres personnes authentifiées sur Lumina.
- Un profil privé n’affiche ses publications qu’après acceptation d’une demande de suivi.
- Le Fil social affiche la personne elle-même et les auteurs qu’elle suit.
- Les Salons publics peuvent être découverts par les utilisateurs de Lumina ; les Salons privés fonctionnent sur invitation.
- Un blocage coupe les relations et la visibilité entre les deux comptes.
- Les Moments suivent la même relation sociale que le Fil et expirent après 24 heures.

## 5. Messages et contenu éphémère

Les messages privés et les messages de Salon sont stockés afin de fournir le service.

Les messages temporisés ou à ouverture unique et les Moments sont retirés du contenu actif selon les règles présentées dans le produit. Lumina ne peut pas empêcher une autre personne de réaliser une capture d’écran, un enregistrement ou une copie avant l’expiration.

## 6. Session et stockage local

La session principale du navigateur utilise un cookie `HttpOnly`, `Secure`, `SameSite=Lax` et `Path=/`. Le JavaScript de l’application ne lit pas ce cookie.

La valeur CSRF nécessaire aux requêtes qui modifient l’état est renvoyée par l’API et conservée en mémoire par l’application. La PWA peut également utiliser le stockage local du navigateur pour des préférences techniques non sensibles.

## 7. Fournisseurs

L’architecture actuelle peut impliquer :

- **Railway** — API ;
- **PostgreSQL** — base de données ;
- **Vercel** — application web ;
- **Cloudflare R2 / service compatible S3** — photos et vidéos ;
- **Resend** — e-mails transactionnels ;
- **Stripe** — uniquement lorsque des fonctionnalités payantes sont activées.

Lumina applique à ses fournisseurs les garanties contractuelles et les mécanismes de transfert exigés par le RGPD, notamment les décisions d’adéquation ou les clauses contractuelles types lorsqu’elles sont applicables.

## 8. Conservation

- Les Moments expirent après 24 heures.
- Les messages temporaires sont nettoyés après leur ouverture ou leur expiration selon le mode choisi.
- Les jetons de récupération expirés et les anciennes tentatives de connexion sont nettoyés périodiquement.
- Les demandes de suppression de compte disposent d’une période de 30 jours avant exécution, sauf obligation légale contraire.
- Les envois abandonnés ou orphelins sont nettoyés par les tâches de l’API.

## 9. Droits

L’application contient des mécanismes techniques pour :

- corriger les données du profil ;
- exporter les données du compte ;
- demander la suppression ;
- annuler la demande pendant la période prévue ;
- gérer la confidentialité, les suivis, les blocages et les sessions.

Les demandes d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité peuvent être envoyées à l’adresse électronique indiquée à la section 1 et sont traitées dans les délais légaux. Lorsque le traitement repose sur le consentement, celui-ci peut être retiré à tout moment. Une réclamation peut également être déposée auprès de l’autorité portugaise de protection des données (CNPD).

Lumina n’utilise pas de décisions exclusivement automatisées produisant des effets juridiques ou des effets tout aussi significatifs sur une personne.

## 10. Sécurité

Lumina applique des mesures techniques telles que le hachage des mots de passe, les sessions révocables, la validation en deux étapes facultative, la protection CSRF, la limitation de débit, la validation des envois, la Content-Security-Policy et le contrôle d’accès côté serveur.

Aucun système n’est invulnérable ; les incidents importants doivent être évalués et traités conformément aux obligations légales applicables.

## 11. Modifications

Cette Politique peut être mise à jour lorsque le produit, les fournisseurs ou les exigences légales évoluent. Les modifications importantes doivent être communiquées de manière appropriée.
