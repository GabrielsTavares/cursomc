import 'package:equatable/equatable.dart';

class WorkoutSummary extends Equatable {
  const WorkoutSummary({
    required this.workoutName,
    required this.totalJumps,
    required this.completedSeries,
    required this.totalSeries,
    required this.elapsed,
    required this.totalRest,
    required this.averageJpm,
  });

  final String workoutName;
  final int totalJumps;
  final int completedSeries;
  final int totalSeries;
  final Duration elapsed;
  final Duration totalRest;
  final int averageJpm;

  @override
  List<Object?> get props => [
        workoutName,
        totalJumps,
        completedSeries,
        totalSeries,
        elapsed,
        totalRest,
        averageJpm,
      ];
}
