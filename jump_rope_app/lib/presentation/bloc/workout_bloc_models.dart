import 'package:equatable/equatable.dart';

import '../../domain/entities/rope_workout_config.dart';
import '../../domain/entities/workout_session_state.dart';
import '../../domain/entities/workout_summary.dart';

abstract class WorkoutEvent extends Equatable {
  const WorkoutEvent();

  @override
  List<Object?> get props => [];
}

class WorkoutInitializeRequested extends WorkoutEvent {
  const WorkoutInitializeRequested(this.config);

  final RopeWorkoutConfig config;

  @override
  List<Object?> get props => [config];
}

class WorkoutStartRequested extends WorkoutEvent {
  const WorkoutStartRequested();
}

class WorkoutTick extends WorkoutEvent {
  const WorkoutTick(this.elapsed);

  final Duration elapsed;

  @override
  List<Object?> get props => [elapsed];
}

class WorkoutJumpDetected extends WorkoutEvent {
  const WorkoutJumpDetected({
    required this.bodyDetected,
    required this.ropePhase,
    required this.showGroundHit,
    required this.leftWrist,
    required this.rightWrist,
    required this.groundY,
  });

  final bool bodyDetected;
  final double ropePhase;
  final bool showGroundHit;
  final ({double x, double y})? leftWrist;
  final ({double x, double y})? rightWrist;
  final double? groundY;

  @override
  List<Object?> get props => [
        bodyDetected,
        ropePhase,
        showGroundHit,
        leftWrist,
        rightWrist,
        groundY,
      ];
}

class WorkoutPauseRequested extends WorkoutEvent {
  const WorkoutPauseRequested();
}

class WorkoutResumeRequested extends WorkoutEvent {
  const WorkoutResumeRequested();
}

class WorkoutStopRequested extends WorkoutEvent {
  const WorkoutStopRequested();
}

class WorkoutRopeSoundToggled extends WorkoutEvent {
  const WorkoutRopeSoundToggled(this.enabled);

  final bool enabled;

  @override
  List<Object?> get props => [enabled];
}

abstract class WorkoutState extends Equatable {
  const WorkoutState();

  @override
  List<Object?> get props => [];
}

class WorkoutInitial extends WorkoutState {
  const WorkoutInitial();
}

class WorkoutLoading extends WorkoutState {
  const WorkoutLoading();
}

class WorkoutPermissionDenied extends WorkoutState {
  const WorkoutPermissionDenied();
}

class WorkoutReady extends WorkoutState {
  const WorkoutReady({
    required this.config,
    required this.ropeSoundEnabled,
  });

  final RopeWorkoutConfig config;
  final bool ropeSoundEnabled;

  @override
  List<Object?> get props => [config, ropeSoundEnabled];
}

class WorkoutActive extends WorkoutState {
  const WorkoutActive({
    required this.config,
    required this.session,
    required this.ropeSoundEnabled,
    this.leftWrist,
    this.rightWrist,
    this.groundY,
    this.statusMessage,
  });

  final RopeWorkoutConfig config;
  final WorkoutSessionState session;
  final bool ropeSoundEnabled;
  final ({double x, double y})? leftWrist;
  final ({double x, double y})? rightWrist;
  final double? groundY;
  final String? statusMessage;

  WorkoutActive copyWith({
    WorkoutSessionState? session,
    bool? ropeSoundEnabled,
    ({double x, double y})? leftWrist,
    ({double x, double y})? rightWrist,
    double? groundY,
    String? statusMessage,
    bool clearStatusMessage = false,
  }) {
    return WorkoutActive(
      config: config,
      session: session ?? this.session,
      ropeSoundEnabled: ropeSoundEnabled ?? this.ropeSoundEnabled,
      leftWrist: leftWrist ?? this.leftWrist,
      rightWrist: rightWrist ?? this.rightWrist,
      groundY: groundY ?? this.groundY,
      statusMessage: clearStatusMessage ? null : statusMessage ?? this.statusMessage,
    );
  }

  @override
  List<Object?> get props => [
        config,
        session,
        ropeSoundEnabled,
        leftWrist,
        rightWrist,
        groundY,
        statusMessage,
      ];
}

class WorkoutFinished extends WorkoutState {
  const WorkoutFinished({
    required this.summary,
    required this.config,
  });

  final WorkoutSummary summary;
  final RopeWorkoutConfig config;

  @override
  List<Object?> get props => [summary, config];
}

class WorkoutFailure extends WorkoutState {
  const WorkoutFailure(this.message);

  final String message;

  @override
  List<Object?> get props => [message];
}
