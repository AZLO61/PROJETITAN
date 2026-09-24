# State model

Le contrôleur React conserve l'état complet nécessaire à l'interface et au moteur. L'IA reçoit une copie de cet état (`cloneEtat`, `src/domain/aiPlanner.js`) et simule ses coups dessus.

Cette copie n'est jamais une seconde source de vérité.
