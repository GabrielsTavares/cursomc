import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../domain/entities/rope_workout_config.dart';
import '../../domain/entities/workout_summary.dart';
import 'home_screen.dart';
import 'workout_session_screen.dart';

class WorkoutCompleteScreen extends StatelessWidget {
  const WorkoutCompleteScreen({
    super.key,
    required this.summary,
    required this.config,
  });

  final WorkoutSummary summary;
  final RopeWorkoutConfig config;

  String _formatDuration(Duration duration) {
    final minutes = duration.inMinutes;
    final seconds = duration.inSeconds % 60;
    return '${minutes}min ${seconds}s';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Treino concluído')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.emoji_events_rounded, size: 72, color: AppTheme.neonGreen),
            const SizedBox(height: 16),
            Text(
              summary.workoutName,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 24),
            _StatTile(label: 'Total de pulos', value: '${summary.totalJumps}'),
            _StatTile(label: 'Séries', value: '${summary.completedSeries}/${summary.totalSeries}'),
            _StatTile(label: 'Tempo total', value: _formatDuration(summary.elapsed)),
            _StatTile(label: 'Ritmo médio', value: '${summary.averageJpm} JPM'),
            const Spacer(),
            FilledButton(
              onPressed: () {
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(builder: (_) => WorkoutSessionScreen(config: config)),
                  (route) => route.isFirst,
                );
              },
              style: FilledButton.styleFrom(
                backgroundColor: AppTheme.neonGreen,
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: const Text('Repetir treino'),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () {
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(builder: (_) => const HomeScreen()),
                  (_) => false,
                );
              },
              child: const Text('Voltar ao início'),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Expanded(child: Text(label, style: TextStyle(color: Colors.white.withOpacity(0.7)))),
          Text(value, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
