import '../domain/entities/rope_workout_config.dart';
import '../domain/entities/workout_session_state.dart';
import '../domain/entities/workout_summary.dart';

enum WorkoutNotificationType {
  seriesComplete,
  restStarted,
  restEnding,
  restComplete,
  workoutComplete,
  milestone,
}

class WorkoutNotification {
  const WorkoutNotification({
    required this.type,
    this.seriesNumber,
    this.message,
  });

  final WorkoutNotificationType type;
  final int? seriesNumber;
  final String? message;
}

class WorkoutEngine {
  WorkoutEngine(this.config);

  final RopeWorkoutConfig config;

  WorkoutSessionState _state = WorkoutSessionState.initial(
    totalSeries: 1,
    seriesTarget: 1,
  );

  Duration _totalRest = Duration.zero;
  DateTime? _restStartedAt;

  WorkoutSessionState get state => _state;

  void start() {
    _totalRest = Duration.zero;
    _state = WorkoutSessionState.initial(
      totalSeries: config.totalSeries,
      seriesTarget: config.jumpsPerSeries,
    ).copyWith(phase: WorkoutPhase.jumping);
  }

  WorkoutTickResult tick(Duration elapsed) {
    if (_state.phase == WorkoutPhase.resting && _restStartedAt != null) {
      final restElapsed = DateTime.now().difference(_restStartedAt!);
      final remaining = config.restBetweenSeries - restElapsed;

      if (remaining <= Duration.zero) {
        return _startNextSeries();
      }

      final notifications = <WorkoutNotification>[];
      if (remaining.inSeconds <= 3 && remaining.inSeconds > 0) {
        notifications.add(
          WorkoutNotification(
            type: WorkoutNotificationType.restEnding,
            message: '${remaining.inSeconds}',
          ),
        );
      }

      _state = _state.copyWith(
        restRemaining: remaining.isNegative ? Duration.zero : remaining,
        elapsed: elapsed,
      );
      return WorkoutTickResult(state: _state, notifications: notifications);
    }

    _state = _state.copyWith(elapsed: elapsed);
    return WorkoutTickResult(state: _state);
  }

  WorkoutJumpResult registerJump({
    required bool bodyDetected,
    required double ropePhase,
    required bool showGroundHit,
  }) {
    if (_state.phase != WorkoutPhase.jumping) {
      return WorkoutJumpResult(
        state: _state.copyWith(
          bodyDetected: bodyDetected,
          ropePhase: ropePhase,
          showGroundHit: showGroundHit,
        ),
      );
    }

    final notifications = <WorkoutNotification>[];
    final newSeriesJumps = _state.seriesJumps + 1;
    final newTotalJumps = _state.totalJumps + 1;

    if (config.milestoneEvery > 0 &&
        newSeriesJumps % config.milestoneEvery == 0 &&
        newSeriesJumps < _state.seriesTarget) {
      notifications.add(
        WorkoutNotification(
          type: WorkoutNotificationType.milestone,
          message: '$newSeriesJumps pulos nesta série',
        ),
      );
    }

    _state = _state.copyWith(
      seriesJumps: newSeriesJumps,
      totalJumps: newTotalJumps,
      bodyDetected: bodyDetected,
      ropePhase: ropePhase,
      showGroundHit: showGroundHit,
    );

    if (newSeriesJumps >= _state.seriesTarget) {
      notifications.add(
        WorkoutNotification(
          type: WorkoutNotificationType.seriesComplete,
          seriesNumber: _state.currentSeries,
          message: 'Série ${_state.currentSeries} concluída',
        ),
      );

      final isLastSeries = _state.currentSeries >= _state.totalSeries;
      if (isLastSeries && !config.restAfterLastSeries) {
        return _completeWorkout(notifications);
      }

      return _startRest(notifications);
    }

    return WorkoutJumpResult(state: _state, notifications: notifications);
  }

  WorkoutTickResult pause() {
    if (_state.phase == WorkoutPhase.paused || _state.phase == WorkoutPhase.complete) {
      return WorkoutTickResult(state: _state);
    }
    _state = _state.copyWith(phase: WorkoutPhase.paused);
    return WorkoutTickResult(state: _state);
  }

  WorkoutTickResult resume() {
    if (_state.phase != WorkoutPhase.paused) {
      return WorkoutTickResult(state: _state);
    }
    _state = _state.copyWith(phase: WorkoutPhase.jumping);
    return WorkoutTickResult(state: _state);
  }

  WorkoutJumpResult _startRest(List<WorkoutNotification> notifications) {
    _restStartedAt = DateTime.now();
    _state = _state.copyWith(
      phase: WorkoutPhase.resting,
      restRemaining: config.restBetweenSeries,
      showGroundHit: false,
    );
    notifications.add(
      WorkoutNotification(
        type: WorkoutNotificationType.restStarted,
        message: 'Descanso ${config.restBetweenSeries.inSeconds}s',
      ),
    );
    return WorkoutJumpResult(state: _state, notifications: notifications);
  }

  WorkoutTickResult _startNextSeries() {
    final notifications = <WorkoutNotification>[
      WorkoutNotification(
        type: WorkoutNotificationType.restComplete,
        seriesNumber: _state.currentSeries + 1,
        message: 'Volte a pular! Série ${_state.currentSeries + 1}',
      ),
    ];

    _state = _state.copyWith(
      phase: WorkoutPhase.jumping,
      currentSeries: _state.currentSeries + 1,
      seriesJumps: 0,
      restRemaining: Duration.zero,
      showGroundHit: false,
    );
    return WorkoutTickResult(state: _state, notifications: notifications);
  }

  WorkoutJumpResult _completeWorkout(List<WorkoutNotification> notifications) {
    _state = _state.copyWith(
      phase: WorkoutPhase.complete,
      showGroundHit: false,
    );
    notifications.add(
      const WorkoutNotification(
        type: WorkoutNotificationType.workoutComplete,
        message: 'Treino concluído!',
      ),
    );
    return WorkoutJumpResult(state: _state, notifications: notifications, summary: buildSummary());
  }

  WorkoutSummary buildSummary() {
    final elapsed = _state.elapsed;
    final minutes = elapsed.inSeconds / 60;
    final jpm = minutes > 0 ? (_state.totalJumps / minutes).round() : _state.totalJumps;

    return WorkoutSummary(
      workoutName: config.name,
      totalJumps: _state.totalJumps,
      completedSeries: _state.currentSeries,
      totalSeries: _state.totalSeries,
      elapsed: elapsed,
      totalRest: _totalRest,
      averageJpm: jpm,
    );
  }

  void trackRestTick(Duration restElapsed) {
    _totalRest = _totalRest + const Duration(seconds: 1);
  }
}

class WorkoutTickResult {
  const WorkoutTickResult({
    required this.state,
    this.notifications = const [],
    this.summary,
  });

  final WorkoutSessionState state;
  final List<WorkoutNotification> notifications;
  final WorkoutSummary? summary;
}

class WorkoutJumpResult {
  const WorkoutJumpResult({
    required this.state,
    this.notifications = const [],
    this.summary,
  });

  final WorkoutSessionState state;
  final List<WorkoutNotification> notifications;
  final WorkoutSummary? summary;
}
