import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/theme/app_theme.dart';
import '../../di/injection.dart';
import '../../domain/entities/rope_workout_config.dart';
import '../../domain/entities/workout_session_state.dart';
import '../bloc/workout_bloc.dart';
import '../widgets/workout_hud.dart';
import 'workout_complete_screen.dart';

class WorkoutSessionScreen extends StatelessWidget {
  const WorkoutSessionScreen({super.key, required this.config});

  final RopeWorkoutConfig config;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => getIt<WorkoutBloc>()..add(WorkoutInitializeRequested(config)),
      child: _WorkoutSessionView(config: config),
    );
  }
}

class _WorkoutSessionView extends StatelessWidget {
  const _WorkoutSessionView({required this.config});

  final RopeWorkoutConfig config;

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<WorkoutBloc, WorkoutState>(
      listener: (context, state) {
        if (state is WorkoutFinished) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(
              builder: (_) => WorkoutCompleteScreen(
                summary: state.summary,
                config: state.config,
              ),
            ),
          );
        }
      },
      builder: (context, state) {
        return Scaffold(
          backgroundColor: Colors.black,
          appBar: AppBar(
            title: Text(config.name),
            actions: [
              if (state is WorkoutActive || state is WorkoutReady)
                IconButton(
                  tooltip: 'Som da corda',
                  onPressed: () {
                    final enabled = state is WorkoutActive
                        ? !state.ropeSoundEnabled
                        : state is WorkoutReady
                            ? !state.ropeSoundEnabled
                            : true;
                    context.read<WorkoutBloc>().add(WorkoutRopeSoundToggled(enabled));
                  },
                  icon: Icon(
                    _ropeSoundIcon(state),
                    color: _ropeSoundEnabled(state) ? AppTheme.neonGreen : Colors.white54,
                  ),
                ),
            ],
          ),
          body: switch (state) {
            WorkoutInitial() || WorkoutLoading() => const Center(
                child: CircularProgressIndicator(color: AppTheme.neonGreen),
              ),
            WorkoutPermissionDenied() => _MessagePanel(
                title: 'Câmera necessária',
                message: 'Permita o acesso à câmera para detectar seus pulos.',
                actionLabel: 'Voltar',
                onAction: () => Navigator.of(context).pop(),
              ),
            WorkoutFailure(:final message) => _MessagePanel(
                title: 'Erro',
                message: message,
                actionLabel: 'Voltar',
                onAction: () => Navigator.of(context).pop(),
              ),
            WorkoutReady(:final config) => _ReadyPanel(config: config),
            WorkoutActive() => _ActivePanel(state: state),
            WorkoutFinished() => const SizedBox.shrink(),
            _ => const SizedBox.shrink(),
          },
        );
      },
    );
  }

  bool _ropeSoundEnabled(WorkoutState state) {
    return switch (state) {
      WorkoutReady(:final ropeSoundEnabled) => ropeSoundEnabled,
      WorkoutActive(:final ropeSoundEnabled) => ropeSoundEnabled,
      _ => true,
    };
  }

  IconData _ropeSoundIcon(WorkoutState state) {
    return _ropeSoundEnabled(state) ? Icons.volume_up_rounded : Icons.volume_off_rounded;
  }
}

class _ReadyPanel extends StatelessWidget {
  const _ReadyPanel({required this.config});

  final RopeWorkoutConfig config;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.videocam_rounded, size: 72, color: AppTheme.neonGreen),
          const SizedBox(height: 16),
          const Text(
            'Prepare o celular',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          Text(
            'Apoie o celular inclinado, de frente para você, com os pés e mãos visíveis na câmera.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white.withOpacity(0.75), height: 1.4),
          ),
          const SizedBox(height: 24),
          _InfoTile(
            label: 'Formato',
            value: '${config.totalSeries} séries × ${config.jumpsPerSeries} pulos',
          ),
          _InfoTile(
            label: 'Descanso',
            value: '${config.restBetweenSeries.inSeconds} segundos entre séries',
          ),
          _InfoTile(
            label: 'Total previsto',
            value: '${config.totalTargetJumps} pulos',
          ),
          const Spacer(),
          FilledButton(
            onPressed: () => context.read<WorkoutBloc>().add(const WorkoutStartRequested()),
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

class _ActivePanel extends StatefulWidget {
  const _ActivePanel({required this.state});

  final WorkoutActive state;

  @override
  State<_ActivePanel> createState() => _ActivePanelState();
}

class _ActivePanelState extends State<_ActivePanel> {
  @override
  void initState() {
    super.initState();
    _startTicker();
  }

  void _startTicker() {
    Future<void>.delayed(const Duration(seconds: 1), () {
      if (!mounted) return;
      final bloc = context.read<WorkoutBloc>();
      bloc.add(WorkoutTick(bloc.elapsed));
      _startTicker();
    });
  }

  @override
  Widget build(BuildContext context) {
    final bloc = context.read<WorkoutBloc>();
    final controller = bloc.cameraController;
    final state = widget.state;

    return Column(
      children: [
        Expanded(
          child: controller == null
              ? WorkoutHud(session: state.session, statusMessage: state.statusMessage)
              : CameraWorkoutView(
                  controller: controller,
                  session: state.session,
                  leftWrist: state.leftWrist,
                  rightWrist: state.rightWrist,
                  groundY: state.groundY,
                  statusMessage: state.statusMessage,
                ),
        ),
        _Controls(
          session: state.session,
          onPause: () => bloc.add(const WorkoutPauseRequested()),
          onResume: () => bloc.add(const WorkoutResumeRequested()),
          onStop: () => bloc.add(const WorkoutStopRequested()),
        ),
      ],
    );
  }
}

class _Controls extends StatelessWidget {
  const _Controls({
    required this.session,
    required this.onPause,
    required this.onResume,
    required this.onStop,
  });

  final WorkoutSessionState session;
  final VoidCallback onPause;
  final VoidCallback onResume;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final isPaused = session.phase == WorkoutPhase.paused;

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: isPaused ? onResume : onPause,
                icon: Icon(isPaused ? Icons.play_arrow_rounded : Icons.pause_rounded),
                label: Text(isPaused ? 'Retomar' : 'Pausar'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton.icon(
                onPressed: onStop,
                style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
                icon: const Icon(Icons.stop_rounded),
                label: const Text('Encerrar'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(child: Text(label, style: TextStyle(color: Colors.white.withOpacity(0.65)))),
          Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _MessagePanel extends StatelessWidget {
  const _MessagePanel({
    required this.title,
    required this.message,
    required this.actionLabel,
    required this.onAction,
  });

  final String title;
  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(title, style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withOpacity(0.75))),
          const SizedBox(height: 24),
          FilledButton(onPressed: onAction, child: Text(actionLabel)),
        ],
      ),
    );
  }
}
