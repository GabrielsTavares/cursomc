import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../domain/entities/rope_workout_config.dart';
import 'workout_session_screen.dart';

class WorkoutBuilderScreen extends StatefulWidget {
  const WorkoutBuilderScreen({super.key});

  @override
  State<WorkoutBuilderScreen> createState() => _WorkoutBuilderScreenState();
}

class _WorkoutBuilderScreenState extends State<WorkoutBuilderScreen> {
  int _series = 10;
  int _jumps = 200;
  int _restSeconds = 40;
  final _nameController = TextEditingController(text: 'Treino personalizado');

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  RopeWorkoutConfig buildConfig() {
    return RopeWorkoutConfig(
      id: 'custom_${DateTime.now().millisecondsSinceEpoch}',
      name: _nameController.text.trim().isEmpty ? 'Treino personalizado' : _nameController.text.trim(),
      totalSeries: _series,
      jumpsPerSeries: _jumps,
      restBetweenSeries: Duration(seconds: _restSeconds),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Montar treino')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          TextField(
            controller: _nameController,
            style: const TextStyle(color: Colors.white),
            decoration: const InputDecoration(
              labelText: 'Nome do treino',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 24),
          _StepperTile(
            label: 'Séries',
            value: _series,
            onChanged: (value) => setState(() => _series = value),
          ),
          _StepperTile(
            label: 'Pulos por série',
            value: _jumps,
            step: 10,
            onChanged: (value) => setState(() => _jumps = value),
          ),
          _StepperTile(
            label: 'Descanso (segundos)',
            value: _restSeconds,
            step: 5,
            onChanged: (value) => setState(() => _restSeconds = value),
          ),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.06),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              'Resumo: $_series séries de $_jumps pulos com $_restSeconds segundos de descanso.\n'
              'Total previsto: ${_series * _jumps} pulos.',
              style: TextStyle(color: Colors.white.withOpacity(0.85)),
            ),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => WorkoutSessionScreen(config: buildConfig()),
                ),
              );
            },
            style: FilledButton.styleFrom(
              backgroundColor: AppTheme.neonGreen,
              foregroundColor: Colors.black,
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
            child: const Text('Iniciar treino'),
          ),
        ],
      ),
    );
  }
}

class _StepperTile extends StatelessWidget {
  const _StepperTile({
    required this.label,
    required this.value,
    required this.onChanged,
    this.step = 1,
  });

  final String label;
  final int value;
  final int step;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: [
          Expanded(child: Text(label, style: const TextStyle(color: Colors.white, fontSize: 16))),
          IconButton(
            onPressed: value > step ? () => onChanged(value - step) : null,
            icon: const Icon(Icons.remove_circle_outline),
          ),
          Text('$value', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          IconButton(
            onPressed: () => onChanged(value + step),
            icon: const Icon(Icons.add_circle_outline),
          ),
        ],
      ),
    );
  }
}
