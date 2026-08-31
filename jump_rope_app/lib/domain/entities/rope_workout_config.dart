import 'package:equatable/equatable.dart';

class RopeWorkoutConfig extends Equatable {
  const RopeWorkoutConfig({
    required this.id,
    required this.name,
    required this.totalSeries,
    required this.jumpsPerSeries,
    required this.restBetweenSeries,
    this.restAfterLastSeries = false,
    this.milestoneEvery = 50,
  });

  final String id;
  final String name;
  final int totalSeries;
  final int jumpsPerSeries;
  final Duration restBetweenSeries;
  final bool restAfterLastSeries;
  final int milestoneEvery;

  int get totalTargetJumps => totalSeries * jumpsPerSeries;

  RopeWorkoutConfig copyWith({
    String? id,
    String? name,
    int? totalSeries,
    int? jumpsPerSeries,
    Duration? restBetweenSeries,
    bool? restAfterLastSeries,
    int? milestoneEvery,
  }) {
    return RopeWorkoutConfig(
      id: id ?? this.id,
      name: name ?? this.name,
      totalSeries: totalSeries ?? this.totalSeries,
      jumpsPerSeries: jumpsPerSeries ?? this.jumpsPerSeries,
      restBetweenSeries: restBetweenSeries ?? this.restBetweenSeries,
      restAfterLastSeries: restAfterLastSeries ?? this.restAfterLastSeries,
      milestoneEvery: milestoneEvery ?? this.milestoneEvery,
    );
  }

  @override
  List<Object?> get props => [
        id,
        name,
        totalSeries,
        jumpsPerSeries,
        restBetweenSeries,
        restAfterLastSeries,
        milestoneEvery,
      ];
}

class RopeWorkoutPresets {
  static const beginner = RopeWorkoutConfig(
    id: 'beginner',
    name: 'Iniciante 50×5',
    totalSeries: 5,
    jumpsPerSeries: 50,
    restBetweenSeries: Duration(seconds: 30),
  );

  static const intermediate = RopeWorkoutConfig(
    id: 'intermediate',
    name: 'Intermediário 100×8',
    totalSeries: 8,
    jumpsPerSeries: 100,
    restBetweenSeries: Duration(seconds: 35),
  );

  static const advanced = RopeWorkoutConfig(
    id: 'advanced',
    name: 'Avançado 200×10',
    totalSeries: 10,
    jumpsPerSeries: 200,
    restBetweenSeries: Duration(seconds: 40),
  );

  static const List<RopeWorkoutConfig> all = [
    beginner,
    intermediate,
    advanced,
  ];
}
