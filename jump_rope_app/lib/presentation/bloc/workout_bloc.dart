import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/services/camera_pose_service.dart';
import '../../domain/entities/rope_workout_config.dart';
import '../../domain/entities/workout_session_state.dart';
import '../../domain/services/jump_counter.dart';
import '../../workout/workout_engine.dart';
import 'workout_bloc_models.dart';

export 'workout_bloc_models.dart';

class WorkoutBloc extends Bloc<WorkoutEvent, WorkoutState> {
  WorkoutBloc({
    required CameraPoseService cameraService,
    required WorkoutAudioService audioService,
  })  : _cameraService = cameraService,
        _audioService = audioService,
        super(const WorkoutInitial()) {
    on<WorkoutInitializeRequested>(_onInitialize);
    on<WorkoutStartRequested>(_onStart);
    on<WorkoutTick>(_onTick);
    on<WorkoutJumpDetected>(_onJumpDetected);
    on<WorkoutPauseRequested>(_onPause);
    on<WorkoutResumeRequested>(_onResume);
    on<WorkoutStopRequested>(_onStop);
    on<WorkoutRopeSoundToggled>(_onRopeSoundToggled);
  }

  final CameraPoseService _cameraService;
  final WorkoutAudioService _audioService;

  StreamSubscription<JumpCounterResult>? _jumpSubscription;
  WorkoutEngine? _engine;
  RopeWorkoutConfig? _config;
  DateTime? _startedAt;
  bool _ropeSoundEnabled = true;

  Future<void> _onInitialize(
    WorkoutInitializeRequested event,
    Emitter<WorkoutState> emit,
  ) async {
    emit(const WorkoutLoading());
    _config = event.config;

    final ready = await _cameraService.initialize();
    if (!ready) {
      emit(const WorkoutPermissionDenied());
      return;
    }

    emit(
      WorkoutReady(
        config: event.config,
        ropeSoundEnabled: _ropeSoundEnabled,
      ),
    );
  }

  Future<void> _onStart(
    WorkoutStartRequested event,
    Emitter<WorkoutState> emit,
  ) async {
    final config = _config;
    if (config == null) return;

    _engine = WorkoutEngine(config)..start();
    _startedAt = DateTime.now();

    await _cameraService.start();
    await _jumpSubscription?.cancel();
    _jumpSubscription = _cameraService.jumpResults.listen((result) {
      add(
        WorkoutJumpDetected(
          bodyDetected: result.bodyDetected,
          ropePhase: result.ropePhase,
          showGroundHit: result.groundHit,
          leftWrist: result.leftWrist != null
              ? (x: result.leftWrist!.x, y: result.leftWrist!.y)
              : null,
          rightWrist: result.rightWrist != null
              ? (x: result.rightWrist!.x, y: result.rightWrist!.y)
              : null,
          groundY: result.groundY,
        ),
      );
    });

    emit(
      WorkoutActive(
        config: config,
        session: _engine!.state,
        ropeSoundEnabled: _ropeSoundEnabled,
        statusMessage: 'Posicione-se na frente da câmera',
      ),
    );
  }

  Future<void> _onTick(
    WorkoutTick event,
    Emitter<WorkoutState> emit,
  ) async {
    final engine = _engine;
    final current = state;
    if (engine == null || current is! WorkoutActive) return;

    final tickResult = engine.tick(event.elapsed);
    await _handleNotifications(tickResult.notifications);

    if (tickResult.summary != null) {
      await _cameraService.stop();
      emit(
        WorkoutFinished(
          summary: tickResult.summary!,
          config: current.config,
        ),
      );
      return;
    }

    emit(
      current.copyWith(
        session: tickResult.state,
        statusMessage: _statusMessage(tickResult.state),
        clearStatusMessage: tickResult.state.phase != WorkoutPhase.resting,
      ),
    );
  }

  Future<void> _onJumpDetected(
    WorkoutJumpDetected event,
    Emitter<WorkoutState> emit,
  ) async {
    final engine = _engine;
    final current = state;
    if (engine == null || current is! WorkoutActive) return;

    if (event.showGroundHit) {
      await _audioService.playRopeHit();
    }

    final jumpResult = engine.registerJump(
      bodyDetected: event.bodyDetected,
      ropePhase: event.ropePhase,
      showGroundHit: event.showGroundHit,
    );

    await _handleNotifications(jumpResult.notifications);

    if (jumpResult.summary != null) {
      await _cameraService.stop();
      emit(
        WorkoutFinished(
          summary: jumpResult.summary!,
          config: current.config,
        ),
      );
      return;
    }

    emit(
      current.copyWith(
        session: jumpResult.state,
        leftWrist: event.leftWrist,
        rightWrist: event.rightWrist,
        groundY: event.groundY,
        statusMessage: _statusMessage(jumpResult.state),
      ),
    );
  }

  Future<void> _onPause(
    WorkoutPauseRequested event,
    Emitter<WorkoutState> emit,
  ) async {
    final engine = _engine;
    final current = state;
    if (engine == null || current is! WorkoutActive) return;

    final result = engine.pause();
    emit(
      current.copyWith(
        session: result.state,
        statusMessage: 'Treino pausado',
      ),
    );
  }

  Future<void> _onResume(
    WorkoutResumeRequested event,
    Emitter<WorkoutState> emit,
  ) async {
    final engine = _engine;
    final current = state;
    if (engine == null || current is! WorkoutActive) return;

    final result = engine.resume();
    emit(
      current.copyWith(
        session: result.state,
        statusMessage: 'Continue pulando',
      ),
    );
  }

  Future<void> _onStop(
    WorkoutStopRequested event,
    Emitter<WorkoutState> emit,
  ) async {
    await _jumpSubscription?.cancel();
    await _cameraService.stop();

    final engine = _engine;
    final config = _config;
    if (engine != null && config != null) {
      emit(
        WorkoutFinished(
          summary: engine.buildSummary(),
          config: config,
        ),
      );
    }
  }

  void _onRopeSoundToggled(
    WorkoutRopeSoundToggled event,
    Emitter<WorkoutState> emit,
  ) {
    _ropeSoundEnabled = event.enabled;
    _audioService.ropeHitEnabled = event.enabled;

    final current = state;
    if (current is WorkoutReady) {
      emit(WorkoutReady(config: current.config, ropeSoundEnabled: event.enabled));
    } else if (current is WorkoutActive) {
      emit(current.copyWith(ropeSoundEnabled: event.enabled));
    }
  }

  Future<void> _handleNotifications(List<WorkoutNotification> notifications) async {
    for (final notification in notifications) {
      await _audioService.handleNotification(notification);
    }
  }

  String? _statusMessage(WorkoutSessionState session) {
    if (!session.bodyDetected) {
      return 'Ajuste a posição — corpo não detectado';
    }
    switch (session.phase) {
      case WorkoutPhase.ready:
        return 'Toque em iniciar quando estiver pronto';
      case WorkoutPhase.jumping:
        return null;
      case WorkoutPhase.resting:
        return 'Descanso — prepare-se para a série ${session.currentSeries + 1}';
      case WorkoutPhase.paused:
        return 'Treino pausado';
      case WorkoutPhase.complete:
        return 'Treino concluído';
    }
  }

  Duration get elapsed {
    if (_startedAt == null) return Duration.zero;
    return DateTime.now().difference(_startedAt!);
  }

  CameraController? get cameraController => _cameraService.cameraController;

  @override
  Future<void> close() async {
    await _jumpSubscription?.cancel();
    _cameraService.dispose();
    _audioService.dispose();
    return super.close();
  }
}
