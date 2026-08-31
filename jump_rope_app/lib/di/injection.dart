import 'package:get_it/get_it.dart';

import '../data/services/camera_pose_service.dart';
import '../presentation/bloc/workout_bloc.dart';

final getIt = GetIt.instance;

Future<void> configureDependencies() async {
  getIt
    ..registerFactory<CameraPoseService>(CameraPoseService.new)
    ..registerFactory<WorkoutAudioService>(WorkoutAudioService.new)
    ..registerFactory(
      () => WorkoutBloc(
        cameraService: getIt(),
        audioService: getIt(),
      ),
    );
}
