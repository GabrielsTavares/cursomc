import 'package:flutter/material.dart';

import 'core/theme/app_theme.dart';
import 'di/injection.dart';
import 'presentation/screens/home_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await configureDependencies();
  runApp(const JumpRopeApp());
}

class JumpRopeApp extends StatelessWidget {
  const JumpRopeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'JumpRope',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark(),
      home: const HomeScreen(),
    );
  }
}
