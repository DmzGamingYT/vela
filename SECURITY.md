# Signaler une vulnérabilité

Vela n'a pas d'adresse e-mail de sécurité. Le canal est le **signalement privé de GitHub** : ouvrez l'onglet **Security** du dépôt, puis **Signaler une vulnérabilité** (« Report a vulnerability »). Le rapport reste privé entre vous et le mainteneur ; il ne devient public qu'après accord sur la divulgation.

Décrivez la version concernée, la plateforme et les étapes de reproduction. Ne joignez pas de données personnelles.

N'ouvrez pas d'issue publique détaillant une faille non corrigée : une issue publique est visible immédiatement et ne laisse aucun délai de correction.

Versions prises en charge : la dernière version publiée (voir `package.json`).
Les versions antérieures ne reçoivent pas de correctif.

Délais indicatifs : accusé de réception sous 7 jours, première évaluation sous
14 jours. Un correctif est publié après accord sur la divulgation ; en l'absence
de réponse sous 90 jours, la divulgation publique est possible.

Limites connues, documentées et non considérées comme des vulnérabilités : absence de signature
Developer ID et de notarisation macOS, absence de synchronisation, et extensions de navigateur non
prises en charge. L'absence de notarisation n'expose plus la chaîne de mise à jour : `latest-mac.yml`
est signé en Ed25519 par la CI et vérifié contre une clé épinglée dans le code, donc un compte GitHub
compromis ne peut pas imposer une mise à jour. Les empreintes SHA-512 publiées restent vérifiées en
plus de cette signature.
