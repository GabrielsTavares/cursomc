import 'package:equatable/equatable.dart';

enum WorkoutPhase {
  ready,
  jumping,
  resting,
  paused,
  complete,
}

class WorkoutSessionState extends Equatable {
  const WorkoutSessionState({
    required this.phase,
    required this.currentSeries,
    required this.totalSeries,
    required this.seriesJumps,
    required this.seriesTarget,
    required this.totalJumps,
    required this.restRemaining,
    required this.elapsed,
    required this.bodyDetected,
    required this.ropePhase,
    required this.showGroundHit,
  });

  factory WorkoutSessionState.initial({
    required int totalSeries,
    required int seriesTarget,
  }) {
    return WorkoutSessionState(
      phase: WorkoutPhase.ready,
      currentSeries: 1,
      totalSeries: totalSeries,
      seriesJumps: 0,
      seriesTarget: seriesTarget,
      totalJumps: 0,
      restRemaining: Duration.zero,
      elapsed: Duration.zero,
      bodyDetected: false,
      ropePhase: 0,
      showGroundHit: false,
    );
  }

  final WorkoutPhase phase;
  final int currentSeries;
  final int totalSeries;
  final int seriesJumps;
  final int seriesTarget;
  final int totalJumps;
  final Duration restRemaining;
  final Duration elapsed;
  final bool bodyDetected;
  final double ropePhase;
  final bool showGroundHit;

  bool get isActiveJumping => phase == WorkoutPhase.jumping;

  WorkoutSessionState copyWith({
    WorkoutPhase? phase,
    int? currentSeries,
    int? totalSeries,
    int? seriesJumps,
    int? seriesTarget,
    int? totalJumps,
    Duration? restRemaining,
    Duration? elapsed,
    bool? bodyDetected,
    double? ropePhase,
    bool? showGroundHit,
  }) {
    return WorkoutSessionState(
      phase: phase ?? this.phase,
      currentSeries: currentSeries ?? this.currentSeries,
      totalSeries: totalSeries ?? this.totalSeries,
      seriesJumps: seriesJumps ?? this.seriesJumps,
      seriesTarget: seriesTarget ?? this.seriesTarget,
      totalJumps: totalJumps ?? this.totalJumps,
      restRemaining: restRemaining ?? this.restRemaining,
      elapsed: elapsed ?? this.elapsed,
      bodyDetected: bodyDetected ?? this.bodyDetected,
      ropePhase: ropePhase ?? this.ropePhase,
      showGroundHit: showGroundHit ?? this.showGroundHit,
    );
  }

  @override
  List<Object?> get props => [
        phase,
        currentSeries,
        totalSeries,
        seriesJumps,
        seriesTarget,
        totalJumps,
        restRemaining,
        elapsed,
        bodyDetected,
        ropePhase,
        showGroundHit,
      ];
}
